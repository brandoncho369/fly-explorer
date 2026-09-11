/// <reference lib="webworker" />
/**
 * Web Worker wrapper around LIFNetwork: loads the binary export, steps the
 * network in the background, and posts one activity byte per neuron per frame.
 */
import { LIFNetwork, RateWindow } from "@/lib/lif";
import { Meta, SHIU_2024, WorkerCommand, WorkerEvent } from "@/lib/types";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (e: WorkerEvent, transfer?: Transferable[]) => ctx.postMessage(e, transfer ?? []);

const RATE_WINDOW_STEPS = 1000; // 100 ms at dt = 0.1

let meta: Meta | null = null;
let net: LIFNetwork | null = null;
let popNames: string[] = [];
let popMasks: Uint8Array[] = [];
let popRates: RateWindow[] = [];
let netRate: RateWindow | null = null;
let running = false;
let target = 0.25;          // × real time
const TICK_MS = 16, BUDGET_MS = 12;
let simMsWindow = 0, wallMsWindow = 0, achieved = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let loadToken = 0;
let awaitingAck = false;   // back-pressure: never let frames pile up on a slow main thread

function frame() {
  timer = null;
  if (!running || !net || !meta || !netRate) return;
  const t0 = performance.now();
  const dt = net.params.dt;
  const wanted = Math.max(1, Math.round((target * TICK_MS) / dt));   // steps needed this tick to hit the target speed
  let fired = 0, steps = 0;
  while (steps < wanted) {
    const f = net.step();
    steps++;
    fired += f.length;
    netRate.push(f.length);
    for (let p = 0; p < popNames.length; p++) {
      let c = 0;
      const m = popMasks[p];
      for (let a = 0; a < f.length; a++) c += m[f[a]];
      popRates[p].push(c);
    }
    if ((steps & 7) === 0 && performance.now() - t0 > BUDGET_MS) break;   // out of time: yield, keep the UI alive
  }
  const spent = performance.now() - t0;
  const stepMs = spent / steps;
  // rolling estimate of achieved speed over ~0.5 s of wall time
  simMsWindow += steps * dt; wallMsWindow += Math.max(spent, TICK_MS);
  if (wallMsWindow >= 500) { achieved = simMsWindow / wallMsWindow; simMsWindow = 0; wallMsWindow = 0; }
  if (!awaitingAck) {
    const n = net.n, act = net.act;
    const activity = new Uint8Array(n);
    for (let i = 0; i < n; i++) activity[i] = (act[i] * 255) | 0;
    const rates: Record<string, number> = {};
    for (let p = 0; p < popNames.length; p++) rates[popNames[p]] = popRates[p].hz();
    awaitingAck = true;
    post(
      { type: "frame", t: net.t, activity, firedThisFrame: fired, rates, networkRate: netRate.hz(), activeStims: net.stims.map((s) => s.name), stepMs, achieved },
      [activity.buffer],
    );
  }
  // the simulation keeps its own pace; frames are only *posted* when the page is ready for one
  timer = setTimeout(frame, Math.max(0, TICK_MS - spent));
}

async function fetchBin(base: string, name: string) {
  const r = await fetch(`${base}/${name}`);
  if (!r.ok) throw new Error(`${base}/${name}: HTTP ${r.status}`);
  return r.arrayBuffer();
}

async function load(base: string) {
  const token = ++loadToken;
  running = false;
  net = null;
  awaitingAck = false;
  post({ type: "progress", message: "fetching meta" });
  const mr = await fetch(`${base}/meta.json`);
  if (!mr.ok) throw new Error(`${base}/meta.json: HTTP ${mr.status} — dataset not exported? see README`);
  const m = (await mr.json()) as Meta;
  if (!m || typeof m.n !== "number" || !m.populations) throw new Error(`${base}/meta.json is not a flybench export`);
  post({ type: "progress", message: `fetching ${m.n.toLocaleString()} neurons / ${m.n_edges.toLocaleString()} edges` });
  const [pos, ip, ix, w, cl] = await Promise.all([
    fetchBin(base, "positions.bin"), fetchBin(base, "indptr.bin"), fetchBin(base, "indices.bin"), fetchBin(base, "weights.bin"), fetchBin(base, "classes.bin"),
  ]);
  if (token !== loadToken) return; // a newer load superseded this one
  const indptr = new Int32Array(ip), indices = new Int32Array(ix), weights = new Float32Array(w);
  if (indptr.length !== m.n + 1 || indptr[m.n] !== indices.length || indices.length !== weights.length || pos.byteLength !== m.n * 12 || cl.byteLength !== m.n) {
    throw new Error("export files are inconsistent with meta.json — re-run `flybench export`");
  }
  meta = m;
  popNames = Object.keys(m.populations);
  popMasks = popNames.map((name) => {
    const mask = new Uint8Array(m.n);
    for (const i of m.populations[name]) if (i >= 0 && i < m.n) mask[i] = 1;
    return mask;
  });
  net = new LIFNetwork({ n: m.n, indptr, indices, weights }, { ...SHIU_2024 });
  popRates = popNames.map((name) => new RateWindow(RATE_WINDOW_STEPS, net!.params.dt, m.populations[name].length));
  netRate = new RateWindow(RATE_WINDOW_STEPS, net.params.dt, m.n);
  const positions = new Float32Array(pos);
  const classes = new Uint8Array(cl);
  post({ type: "loaded", meta: m, positions, classes }, [positions.buffer, classes.buffer]);
}

ctx.onmessage = async (ev: MessageEvent<WorkerCommand>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "load":
        await load(msg.base);
        break;
      case "params":
        net?.setParams(msg.params);
        break;
      case "stim":
        net?.addStimulus(msg.name, msg.neurons, msg.rateHz, msg.durationMs);
        break;
      case "stopStim":
        net?.removeStimulus(msg.name);
        break;
      case "run":
        running = msg.running && !!net;
        if (running && timer === null) frame();
        break;
      case "ack":
        awaitingAck = false;
        break;
      case "speed":
        target = Math.min(4, Math.max(0.01, msg.target));
        break;
      case "reset":
        net?.reset();
        netRate?.clear();
        popRates.forEach((r) => r.clear());
        break;
    }
  } catch (e) {
    running = false;
    post({ type: "error", message: (e as Error).message });
  }
};
