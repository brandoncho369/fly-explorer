/**
 * Pure leaky integrate-and-fire network over a CSR graph. No DOM, no worker —
 * so it can be unit-tested in Node and reused anywhere.
 *
 * Same model as flybench (Shiu et al. 2024):
 *   tau_m dV/dt = (V_rest − V) + g ;  tau_s dg/dt = −g
 *   spike (after `delay`): g[post] += wSyn · gain · W[pre, post]
 */
import { LIFParams } from "./types";

export interface Graph {
  n: number;
  indptr: Int32Array;   // length n+1, rows = presynaptic
  indices: Int32Array;  // postsynaptic index per edge
  weights: Float32Array; // signed synapse count per edge
}

export interface StimulusState {
  name: string;
  neurons: Int32Array;
  prob: number;   // per-step spike probability = rate_hz * dt / 1000
  until: number;  // simulated ms at which it stops
}

export class LIFNetwork {
  readonly n: number;
  params: LIFParams;
  v!: Float32Array;
  g!: Float32Array;
  refUntil!: Float32Array;
  act!: Float32Array;     // display-only decaying trace of recent spikes
  t = 0;
  stims: StimulusState[] = [];
  private queue: Int32Array[] = [];
  private qi = 0;
  private delaySteps = 1;
  private decayM = 0;
  private decayS = 0;
  private wScale = 0;
  private rng: () => number;

  constructor(readonly graph: Graph, params: LIFParams, rng: () => number = Math.random) {
    this.n = graph.n;
    this.params = { ...params };
    this.rng = rng;
    this.reset();
  }

  /** Fresh state. Stimuli are cleared too. */
  reset(): void {
    const p = this.params;
    this.v = new Float32Array(this.n).fill(p.vRest);
    this.g = new Float32Array(this.n);
    this.refUntil = new Float32Array(this.n).fill(-1);
    this.act = new Float32Array(this.n);
    this.t = 0;
    this.delaySteps = Math.max(1, Math.round(p.delay / p.dt));
    this.queue = Array.from({ length: this.delaySteps }, () => new Int32Array(0));
    this.qi = 0;
    this.stims = [];
    this.recompute();
  }

  /** Apply parameter changes. Weight/time-constant changes apply live; dt or delay changes reset. */
  setParams(patch: Partial<LIFParams>): void {
    const structural = ("dt" in patch && patch.dt !== this.params.dt) || ("delay" in patch && patch.delay !== this.params.delay);
    this.params = { ...this.params, ...patch };
    if (structural) this.reset();
    else this.recompute();
  }

  private recompute(): void {
    const p = this.params;
    this.decayM = p.dt / p.tauM;
    this.decayS = Math.exp(-p.dt / p.tauSyn);
    this.wScale = p.wSyn * p.gain;
  }

  addStimulus(name: string, neurons: Int32Array, rateHz: number, durationMs: number): void {
    this.stims = this.stims.filter((s) => s.name !== name);
    if (!neurons.length || rateHz <= 0 || durationMs <= 0) return;
    this.stims.push({ name, neurons, prob: Math.min(1, (rateHz * this.params.dt) / 1000), until: this.t + durationMs });
  }

  removeStimulus(name: string): void {
    this.stims = this.stims.filter((s) => s.name !== name);
  }

  /** Advance one dt. Returns the indices that spiked this step. */
  step(): Int32Array {
    const { indptr, indices, weights } = this.graph;
    const p = this.params;
    const v = this.v, g = this.g, refUntil = this.refUntil, act = this.act, n = this.n;
    // 1. deliver spikes whose conduction delay expired
    const arriving = this.queue[this.qi];
    const ws = this.wScale;
    for (let a = 0; a < arriving.length; a++) {
      const pre = arriving[a];
      const end = indptr[pre + 1];
      for (let k = indptr[pre]; k < end; k++) g[indices[k]] += weights[k] * ws;
    }
    // 2. integrate + threshold
    this.t += p.dt;
    const t = this.t, vRest = p.vRest, vTh = p.vTh, vReset = p.vReset, tRef = p.tRef, dM = this.decayM, dS = this.decayS;
    const fired: number[] = [];
    for (let i = 0; i < n; i++) {
      v[i] += (vRest - v[i] + g[i]) * dM;
      g[i] *= dS;
      act[i] *= 0.97;
      if (v[i] >= vTh && refUntil[i] < t) {
        fired.push(i);
        v[i] = vReset;
        refUntil[i] = t + tRef;
        act[i] = 1;
      }
    }
    // 3. forced (stimulus) spikes, still honouring the refractory period
    for (let s = this.stims.length - 1; s >= 0; s--) {
      const st = this.stims[s];
      if (t > st.until) { this.stims.splice(s, 1); continue; }
      const ns = st.neurons, prob = st.prob;
      for (let j = 0; j < ns.length; j++) {
        if (this.rng() < prob) {
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
    const f = Int32Array.from(fired);
    this.queue[this.qi] = f;
    this.qi = (this.qi + 1) % this.delaySteps;
    return f;
  }
}

/** Ring buffer of per-step spike counts → mean Hz per neuron over the window. */
export class RateWindow {
  private buf: Uint32Array;
  private i = 0;
  constructor(readonly steps: number, readonly dt: number, readonly size: number) {
    this.buf = new Uint32Array(steps);
  }
  push(count: number): void {
    this.buf[this.i] = count;
    this.i = (this.i + 1) % this.steps;
  }
  hz(): number {
    if (!this.size) return 0;
    let s = 0;
    for (let k = 0; k < this.buf.length; k++) s += this.buf[k];
    return s / this.size / ((this.steps * this.dt) / 1000);
  }
  clear(): void { this.buf.fill(0); this.i = 0; }
}

/** Tiny deterministic PRNG (mulberry32) for tests and reproducible runs. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a CSR graph from an edge list — used by tests and the toy loader. */
export function csrFromEdges(n: number, edges: Array<[pre: number, post: number, w: number]>): Graph {
  const sorted = [...edges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const indptr = new Int32Array(n + 1);
  for (const [pre] of sorted) indptr[pre + 1]++;
  for (let i = 0; i < n; i++) indptr[i + 1] += indptr[i];
  return { n, indptr, indices: Int32Array.from(sorted.map((e) => e[1])), weights: Float32Array.from(sorted.map((e) => e[2])) };
}
