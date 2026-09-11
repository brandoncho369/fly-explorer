export interface Meta {
  name: string;
  n: number;
  n_edges: number;
  bounds: { min: number[]; max: number[] };
  classes: string[];
  populations: Record<string, number[]>;
  source: Record<string, unknown>;
}

export interface LIFParams {
  vRest: number;
  vReset: number;
  vTh: number;
  tauM: number;
  tauSyn: number;
  tRef: number;
  delay: number;
  wSyn: number;
  gain: number;
  dt: number;
}

export const SHIU_2024: LIFParams = {
  vRest: -52,
  vReset: -52,
  vTh: -45,
  tauM: 20,
  tauSyn: 5,
  tRef: 2.2,
  delay: 1.8,
  wSyn: 0.275,
  gain: 1.0,
  dt: 0.1,
};

// ---- main -> worker
export type WorkerCommand =
  | { type: "load"; base: string }
  | { type: "params"; params: Partial<LIFParams> }
  | { type: "stim"; name: string; neurons: Int32Array; rateHz: number; durationMs: number }
  | { type: "stopStim"; name: string }
  | { type: "run"; running: boolean }
  | { type: "speed"; target: number }   // target simulated-seconds per wall-second (1 = real time)
  | { type: "ack" }
  | { type: "reset" };

// ---- worker -> main
export type WorkerEvent =
  | { type: "loaded"; meta: Meta; positions: Float32Array; classes: Uint8Array }
  | { type: "progress"; message: string }
  | {
      type: "frame";
      t: number;
      activity: Uint8Array;
      firedThisFrame: number;
      rates: Record<string, number>;
      networkRate: number;
      activeStims: string[];
      stepMs: number;
      achieved: number;   // simulated-seconds per wall-second actually reached
    }
  | { type: "error"; message: string };
