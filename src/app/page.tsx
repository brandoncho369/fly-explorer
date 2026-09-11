"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Meta, SHIU_2024, WorkerCommand, WorkerEvent } from "@/lib/types";
import Hint, { HELP } from "@/components/Hint";

const Brain = dynamic(() => import("@/components/Brain"), { ssr: false });

// default gain per dataset: flybench's sweep on the Princeton-filtered v783 connections
// puts the reflex window at ≈0.4–0.45; Shiu et al.'s 1.0 (fit on older synapse predictions) lights up ~20% of the brain.
const DATASETS = [
  { id: "toy", label: "toy (2k, synthetic)", gain: 1.0 },
  { id: "flywire783", label: "FlyWire v783 (140k, real)", gain: 0.45 },
];

interface Frame { t: number; firedThisFrame: number; rates: Record<string, number>; networkRate: number; activeStims: string[]; stepMs: number }

const READOUTS = ["MN9 (proboscis)", "Giant Fiber", "descending neurons"];
const POP_HELP: Record<string, string> = {
  "sugar GRNs": "Gustatory receptor neurons on the fly's mouthparts and legs that respond to sugar. Firing them is 'tasting sugar'. Real flies respond by extending the proboscis.",
  "bitter GRNs": "Taste neurons that detect bitter compounds. Real flies reject food when these fire; in the model they should shut down the sugar response.",
  "water GRNs": "Taste neurons that respond to water. Thirsty flies extend the proboscis to them.",
  "looming (LPLC2/LC4)": "Visual neurons that detect an object rapidly expanding in the eye, i.e. something rushing at the fly. They drive the Giant Fiber escape.",
  "olfactory RNs": "All ~2,300 smell receptor neurons in the antennae at once, an 'every smell simultaneously' input. Real odours activate only a few channels.",
  "JO (antennal mechanosensory)": "Johnston's organ, the ~1,100 neurons in the antenna that sense sound, wind and gravity.",
  "photoreceptors": "All ~11,000 light-sensing cells in both eyes at once, a full-field flash. Not a moving object, so it should not trigger escape.",
  "descending neurons": "The ~1,300 neurons that carry commands from the brain down to the body. Every behaviour goes through them.",
  "MN9 (proboscis)": "Motor neuron 9, which extends the proboscis (the fly's tongue). Its firing means 'feed'.",
  "Giant Fiber": "A pair of huge neurons that trigger the fastest escape a fly has: legs push, wings open, it's airborne in ~10 ms.",
};
const STIMULI = ["sugar GRNs", "bitter GRNs", "water GRNs", "looming (LPLC2/LC4)", "olfactory RNs"];

export default function Page() {
  const workerRef = useRef<Worker | null>(null);
  const activityRef = useRef<Uint8Array | null>(null);
  const [dataset, setDataset] = useState("toy");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [positions, setPositions] = useState<Float32Array | null>(null);
  const [classes, setClasses] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState("starting worker…");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [running, setRunning] = useState(true);
  const [gain, setGain] = useState(SHIU_2024.gain);
  const [speed, setSpeed] = useState(10);
  const [rateHz, setRateHz] = useState(100);
  const [highlight, setHighlight] = useState<Set<number>>(new Set());
  const [showAbout, setShowAbout] = useState(false);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const loading = !meta && !error;

  const send = useCallback((cmd: WorkerCommand, transfer?: Transferable[]) => workerRef.current?.postMessage(cmd, transfer ?? []), []);

  useEffect(() => {
    const w = new Worker(new URL("../workers/lif.worker.ts", import.meta.url));
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<WorkerEvent>) => {
      const e = ev.data;
      if (e.type === "progress") setStatus(e.message);
      else if (e.type === "error") { setError(e.message); setStatus("error"); setRunning(false); }
      else if (e.type === "loaded") {
        setMeta(e.meta); setPositions(e.positions); setClasses(e.classes); setError(null);
        setStatus(`${e.meta.name}: ${e.meta.n.toLocaleString()} neurons · ${e.meta.n_edges.toLocaleString()} edges`);
        setHistory({});
        const g = DATASETS.find((d) => d.id === e.meta.name)?.gain ?? SHIU_2024.gain;
        setGain(g);
        w.postMessage({ type: "params", params: { gain: g } } satisfies WorkerCommand);
        w.postMessage({ type: "speed", stepsPerFrame: 10 } satisfies WorkerCommand);
        w.postMessage({ type: "run", running: true } satisfies WorkerCommand);
      } else if (e.type === "frame") {
        activityRef.current = e.activity;
        setFrame(e);
        setHistory((h) => {
          const next = { ...h };
          for (const k of READOUTS) { const arr = (next[k] ?? []).concat(e.rates[k] ?? 0); next[k] = arr.slice(-120); }
          return next;
        });
      }
    };
    w.postMessage({ type: "load", base: "/data/toy" } satisfies WorkerCommand);
    return () => w.terminate();
  }, []);

  useEffect(() => { send({ type: "params", params: { gain } }); }, [gain, send]);
  useEffect(() => { send({ type: "speed", stepsPerFrame: speed }); }, [speed, send]);
  useEffect(() => { send({ type: "run", running }); }, [running, send]);

  const loadDataset = (id: string) => {
    setDataset(id); setMeta(null); setPositions(null); setClasses(null); setFrame(null); setError(null); setStatus("loading…"); setHighlight(new Set());
    activityRef.current = null;
    setRunning(true);
    send({ type: "load", base: `/data/${id}` });
  };

  const stimulate = (name: string, durationMs = 500) => {
    const idx = meta?.populations[name];
    if (!idx?.length) return;
    send({ type: "stim", name, neurons: Int32Array.from(idx), rateHz, durationMs });
  };

  const stimSets = useMemo(() => (meta ? Object.keys(meta.populations).filter((k) => !READOUTS.includes(k)) : []), [meta]);
  const readouts = useMemo(() => (meta ? READOUTS.filter((k) => meta.populations[k]) : []), [meta]);

  const toggleHighlight = (name: string) => {
    const idx = meta?.populations[name] ?? [];
    setHighlight((prev) => {
      const s = new Set(prev);
      const allIn = idx.every((i) => s.has(i));
      idx.forEach((i) => (allIn ? s.delete(i) : s.add(i)));
      return s;
    });
  };

  return (
    <main className="h-dvh w-full grid grid-cols-1 lg:grid-cols-[360px_1fr] bg-[#07080c] text-zinc-200">
      <aside className="order-2 lg:order-1 overflow-y-auto border-t lg:border-t-0 lg:border-r border-zinc-800 p-4 space-y-5 text-sm">
        <header>
          <div className="flex items-baseline justify-between"><h1 className="text-lg font-semibold tracking-tight">fly-explorer</h1><a href="/bench" className="text-xs text-amber-300 hover:text-amber-200">benchmark →</a></div>
          <p className="text-zinc-400 text-xs mt-1">A fruit-fly connectome running as a leaky integrate-and-fire network, live, in your browser. Poke a sense; watch the wiring answer.</p>
        </header>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">connectome<Hint title="connectome" text={HELP.connectome} /></label>
          <select value={dataset} disabled={loading} onChange={(e) => loadDataset(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 disabled:opacity-50">
            {DATASETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <p className="text-xs text-zinc-500">{error ? <span className="text-red-400">couldn&apos;t load: {error}. {dataset !== "toy" && <button className="underline" onClick={() => loadDataset("toy")}>back to toy</button>}</span> : status}</p>
        </section>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">stimulate ({rateHz} Hz Poisson, 500 ms)<Hint title="stimulate" text={HELP.stimulate} /></label>
          <div className="grid grid-cols-2 gap-1.5">
            {stimSets.filter((s) => STIMULI.includes(s)).concat(stimSets.filter((s) => !STIMULI.includes(s))).map((name) => (
              <div key={name} className="flex">
                <button onClick={() => stimulate(name)} disabled={!meta}
                  className={`flex-1 text-left px-2 py-1.5 rounded-l border border-zinc-700 hover:border-zinc-400 bg-zinc-900 disabled:opacity-40 ${frame?.activeStims.includes(name) ? "bg-amber-300/20 border-amber-300" : ""}`}>
                  {name} <span className="text-zinc-500">({meta?.populations[name].length})</span>
                  {POP_HELP[name] && <Hint title={name} text={POP_HELP[name]} />}
                </button>
                <button title="highlight these neurons in the 3D view" aria-label={`highlight ${name}`} onClick={() => toggleHighlight(name)} className="px-2 rounded-r border border-l-0 border-zinc-700 bg-zinc-900 hover:border-zinc-400 text-cyan-300">◉</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>input rate<Hint title="input rate" text={HELP.inputRate} /></span>
            <input type="range" min={10} max={300} step={10} value={rateHz} onChange={(e) => setRateHz(+e.target.value)} className="flex-1" aria-label="input rate (Hz)" />
            <span className="w-12 text-right">{rateHz} Hz</span>
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">readouts (mean Hz / neuron, last 100 ms)<Hint title="readouts" text={HELP.readouts} /></label>
          {readouts.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-36 flex items-center"><button onClick={() => toggleHighlight(k)} className="truncate text-left hover:text-cyan-300" title="highlight these neurons in the 3D view">{k}</button>{POP_HELP[k] && <Hint title={k} text={POP_HELP[k]} />}</span>
              <Spark values={history[k] ?? []} />
              <span className="w-16 text-right tabular-nums font-mono">{(frame?.rates[k] ?? 0).toFixed(0)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xs text-zinc-500 pt-1">
            <span>whole network<Hint title="whole network" text={HELP.network} /></span><span className="font-mono">{(frame?.networkRate ?? 0).toFixed(2)} Hz</span>
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">model</label>
          <Slider label="gain" help={HELP.gain} value={gain} min={0.1} max={3} step={0.05} onChange={setGain} fmt={(v) => v.toFixed(2) + "×"} />
          <Slider label="speed" help={HELP.speed} value={speed} min={1} max={50} step={1} onChange={setSpeed} fmt={(v) => `${v} steps/frame`} />
          <div className="flex flex-wrap gap-2 pt-1">
            <span><button onClick={() => setRunning((r) => !r)} disabled={!meta} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400 disabled:opacity-40">{running ? "pause" : "run"}</button><Hint title="pause / run" text={HELP.pause} /></span>
            <span><button onClick={() => send({ type: "reset" })} disabled={!meta} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400 disabled:opacity-40">reset</button><Hint title="reset" text={HELP.reset} /></span>
            <span><button onClick={() => setGain(SHIU_2024.gain)} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400">Shiu 2024</button><Hint title="Shiu 2024 preset" text={HELP.presetShiu} /></span>
            <span><button onClick={() => setGain(0.45)} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400">flybench</button><Hint title="flybench preset" text={HELP.presetFlybench} /></span>
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            t = {((frame?.t ?? 0) / 1000).toFixed(2)} s · {frame?.stepMs.toFixed(2) ?? "–"} ms/step · dt 0.1 ms · τm 20 · τs 5 · Vth −45 · w 0.275 mV
            <Hint title="status line" text={HELP.status} />
          </p>
        </section>

        <section className="text-xs text-zinc-400 space-y-1 border-t border-zinc-800 pt-3">
          <button onClick={() => setShowAbout((s) => !s)} className="text-zinc-300 hover:text-white">{showAbout ? "▾" : "▸"} what is this actually showing?</button>
          {showAbout && (
            <div className="space-y-2 leading-relaxed">
              <p>Each dot is a neuron from the FlyWire connectome (or the synthetic toy). Edges are synapse counts; each neuron is the same 5-constant leaky integrate-and-fire unit from Shiu et al. 2024. Nothing is learned or hand-tuned per neuron: when sugar lights up MN9, the wiring did that.</p>
              <p>It is <b>not</b> a fly. No neuromodulators, no gap junctions, no plasticity, no spontaneous activity, no body. Firing rates are only meaningful relative to each other. Nothing in here experiences anything — it is a very large, very fast truth table of &ldquo;if these fire, those fire.&rdquo;</p>
              <p>Benchmark whether a parameter choice still reproduces known reflexes on the <a href="/bench" className="underline text-amber-300">flybench</a> page, or on <a href="https://github.com/brandoncho369/fly-explorer" className="underline">GitHub</a>.</p>
            </div>
          )}
        </section>
      </aside>

      <section className="order-1 lg:order-2 relative min-h-[50dvh]">
        {positions && classes ? <Brain positions={positions} classes={classes} activityRef={activityRef} highlight={highlight} /> : (
          <div className="absolute inset-0 grid place-items-center text-zinc-500 text-sm">{status}</div>
        )}
        <Legend />
      </section>
    </main>
  );
}

function Slider({ label, help, value, min, max, step, onChange, fmt }: { label: string; help?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="w-14 flex items-center">{label}{help && <Hint title={label} text={help} />}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="flex-1" aria-label={label} />
      <span className="w-24 text-right font-mono">{fmt(value)}</span>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const w = 120, h = 22;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} className="flex-1 text-amber-300">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

function Legend() {
  const items: [string, string][] = [["sensory", "#59bff2"], ["visual projection", "#8cd98c"], ["central", "#9999b8"], ["descending", "#f29959"], ["motor", "#fa6673"]];
  return (
    <div className="absolute bottom-3 right-3 flex flex-wrap gap-3 text-[11px] text-zinc-400 bg-black/40 rounded px-2 py-1">
      {items.map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />{k}</span>)}
      <span className="flex items-center gap-1"><i className="inline-block w-2 h-2 rounded-full bg-amber-200" />firing</span>
      <Hint title="legend" text={HELP.legend} />
    </div>
  );
}
