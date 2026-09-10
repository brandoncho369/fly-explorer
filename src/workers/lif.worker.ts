/// <reference lib="webworker" />
/**
 * Leaky integrate-and-fire simulation of a whole connectome, in a Web Worker.
 *
 * Same model and constants as flybench (Shiu et al. 2024):
 *   tau_m dV/dt = (V_rest - V) + g ;  tau_s dg/dt = -g
 *   spike (after delay): g[post] += w_syn * gain * W[pre,post]
 *
 * Event-driven on the synaptic side: only neurons that spiked walk their CSR
 * row, so cost scales with activity, not with the number of synapses.
 */
import { LIFParams, Meta, SHIU_2024, WorkerCommand, WorkerEvent } from "@/lib/types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (e: WorkerEvent, transfer?: Transferable[]) => ctx.postMessage(e, transfer ?? []);

let meta: Meta | null = null;
let n = 0;
let indptr: Int32Array, indices: Int32Array, weights: Float32Array;
let params: LIFParams = { ...SHIU_2024 };

// state
let v: Float32Array, g: Float32Array, refUntil: Float32Array, act: Float32Array;
let queue: Int32Array[] = [];
let qi = 0;
let t = 0;
let delaySteps = 18;
let decayM = 0, decayS = 0, wScale = 0;

// population bookkeeping for rate readouts
const RATE_WINDOW_STEPS = 1000; // 100 ms at dt=0.1
let popNames: string[] = [];
let popMasks: Uint8Array[] = [];
let popSizes: number[] = [];
let popCounts: Uint32Array[] = []; // ring buffers of per-step spike counts
let netCounts: Uint32Array;
let ring = 0;

// stimuli
interface Stim { name: string; neurons: Int32Array; prob: number; until: number }
let stims: Stim[] = [];

let running = false;
let stepsPerFrame = 10;
let timer: ReturnType<typeof setTimeout> | null = null;

function reset() {
  v = new Float32Array(n).fill(params.vRest);
  g = new Float32Array(n);
  refUntil = new Float32Array(n).fill(-1);
  act = new Float32Array(n);
  t = 0;
  delaySteps = Math.max(1, Math.round(params.delay / params.dt));
  queue = Array.from({ length: delaySteps }, () => new Int32Array(0));
  qi = 0;
  decayM = params.dt / params.tauM;
  decayS = Math.exp(-params.dt / params.tauSyn);
  wScale = params.wSyn * params.gain;
  popCounts = popNames.map(() => new Uint32Array(RATE_WINDOW_STEPS));
  netCounts = new Uint32Array(RATE_WINDOW_STEPS);
  ring = 0;
  stims = [];
}

function step(): number {
  // 1. deliver delayed spikes
  const arriving = queue[qi];
  for (let a = 0; a < arriving.length; a++) {
    const pre = arriving[a];
    const end = indptr[pre + 1];
    for (let k = indptr[pre]; k < end; k++) g[indices[k]] += weights[k] * wScale;
  }
  // 2. integrate + threshold
  t += params.dt;
  const vRest = params.vRest, vTh = params.vTh, vReset = params.vReset, tRef = params.tRef;
  const fired: number[] = [];
  for (let i = 0; i < n; i++) {
    v[i] += (vRest - v[i] + g[i]) * decayM;
    g[i] *= decayS;
    act[i] *= 0.97;
    if (v[i] >= vTh && refUntil[i] < t) {
      fired.push(i);
      v[i] = vReset;
      refUntil[i] = t + tRef;
      act[i] = 1;
    }
  }
  // 3. forced (stimulus) spikes
  for (let s = stims.length - 1; s >= 0; s--) {
    const st = stims[s];
    if (t > st.until) { stims.splice(s, 1); continue; }
    const ns = st.neurons;
    for (let j = 0; j < ns.length; j++) {
      if (Math.random() < st.prob) {
        const i = ns[j];
        if (refUntil[i] < t) {
          fired.push(i);
          v[i] = vReset;
          refUntil[i] = t + tRef;
          act[i] = 1;
        }
      }
    }
  }
  // 4. bookkeeping
  const f = Int32Array.from(fired);
  queue[qi] = f;
  qi = (qi + 1) % delaySteps;
  netCounts[ring] = f.length;
  for (let p = 0; p < popNames.length; p++) {
    let c = 0;
    const m = popMasks[p];
    for (let a = 0; a < f.length; a++) c += m[f[a]];
    popCounts[p][ring] = c;
  }
  ring = (ring + 1) % RATE_WINDOW_STEPS;
  return f.length;
}

function rates(): Record<string, number> {
  const windowS = (RATE_WINDOW_STEPS * params.dt) / 1000;
  const out: Record<string, number> = {};
  for (let p = 0; p < popNames.length; p++) {
    let s = 0;
    const c = popCounts[p];
    for (let k = 0; k < c.length; k++) s += c[k];
    out[popNames[p]] = popSizes[p] ? s / popSizes[p] / windowS : 0;
  }
  return out;
}

function networkRate(): number {
  let s = 0;
  for (let k = 0; k < netCounts.length; k++) s += netCounts[k];
  return s / n / ((RATE_WINDOW_STEPS * params.dt) / 1000);
}

function frame() {
  timer = null;
  if (!running || !meta) return;
  const t0 = performance.now();
  let fired = 0;
  for (let s = 0; s < stepsPerFrame; s++) fired += step();
  const stepMs = (performance.now() - t0) / stepsPerFrame;
  const activity = new Uint8Array(n);
  for (let i = 0; i < n; i++) activity[i] = (act[i] * 255) | 0;
  post(
    { type: "frame", t, activity, firedThisFrame: fired, rates: rates(), networkRate: networkRate(), activeStims: stims.map((s) => s.name), stepMs },
    [activity.buffer],
  );
  timer = setTimeout(frame, 16);
}

async function fetchBin(base: string, name: string) {
  const r = await fetch(`${base}/${name}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.arrayBuffer();
}

async function load(base: string) {
  post({ type: "progress", message: "fetching meta" });
  const m = (await (await fetch(`${base}/meta.json`)).json()) as Meta;
  meta = m;
  n = m.n;
  post({ type: "progress", message: `fetching ${m.n.toLocaleString()} neurons / ${m.n_edges.toLocaleString()} edges` });
  const [pos, ip, ix, w, cl] = await Promise.all([
    fetchBin(base, "positions.bin"),
    fetchBin(base, "indptr.bin"),
    fetchBin(base, "indices.bin"),
    fetchBin(base, "weights.bin"),
    fetchBin(base, "classes.bin"),
  ]);
  indptr = new Int32Array(ip);
  indices = new Int32Array(ix);
  weights = new Float32Array(w);
  popNames = Object.keys(m.populations);
  popMasks = popNames.map((name) => {
    const mask = new Uint8Array(n);
    for (const i of m.populations[name]) mask[i] = 1;
    return mask;
  });
  popSizes = popNames.map((name) => m.populations[name].length);
  reset();
  const positions = new Float32Array(pos);
  const classes = new Uint8Array(cl);
  post({ type: "loaded", meta: m, positions, classes }, [positions.buffer, classes.buffer]);
}

ctx.onmessage = async (ev: MessageEvent<WorkerCommand>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "load":
        running = false;
        await load(msg.base);
        break;
      case "params": {
        const wasRunning = running;
        params = { ...params, ...msg.params };
        // gain / weight changes apply live; structural changes (dt, delay) need a reset
        if ("dt" in msg.params || "delay" in msg.params) reset();
        wScale = params.wSyn * params.gain;
        decayM = params.dt / params.tauM;
        decayS = Math.exp(-params.dt / params.tauSyn);
        running = wasRunning;
        break;
      }
      case "stim": {
        stims = stims.filter((s) => s.name !== msg.name);
        stims.push({ name: msg.name, neurons: msg.neurons, prob: (msg.rateHz * params.dt) / 1000, until: t + msg.durationMs });
        break;
      }
      case "stopStim":
        stims = stims.filter((s) => s.name !== msg.name);
        break;
      case "run":
        running = msg.running;
        if (running && timer === null) frame();
        break;
      case "speed":
        stepsPerFrame = Math.max(1, msg.stepsPerFrame | 0);
        break;
      case "reset":
        reset();
        break;
    }
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
  }
};
