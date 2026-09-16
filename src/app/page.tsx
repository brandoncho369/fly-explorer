"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { guideKey, type GuideKey } from "@/lib/guide";
import { Meta, SHIU_2024, WorkerCommand, WorkerEvent } from "@/lib/types";
import { Explain, HELP, HelpPanel, HelpProvider } from "@/components/Hint";
import { CellTypes } from "@/components/CellTypes";
import { FlyMode } from "@/components/FlyMode";
import { track } from "@/lib/track";
import EditableValue from "@/components/EditableValue";
import { decodeState, encodeState, missingNames, type ExplorerState } from "@/lib/permalink";

const Brain = dynamic(() => import("@/components/Brain"), { ssr: false });

// default gain per dataset: flybench's sweep on the Princeton-filtered v783 connections
// puts the reflex window at ≈0.4–0.45; Shiu et al.'s 1.0 (fit on older synapse predictions) lights up ~20% of the brain.
const DATASETS = [
  { id: "toy", label: "toy (2k, synthetic)", gain: 1.0 },
  { id: "flywire783", label: "FlyWire v783 (140k, real)", gain: 0.45 },
  // MaleCNS: brain + ventral nerve cord, so the muscle motor neurons are in here. flybench found no single gain that
  // does both taste and vision on it; 0.65 is the setting the Minecraft demo used and the one most people have seen.
  { id: "malecns", label: "MaleCNS v1.0 (176k, brain + nerve cord)", gain: 0.65 },
];

interface Frame { t: number; firedThisFrame: number; rates: Record<string, number>; networkRate: number; activeStims: string[]; stepMs: number; achieved: number }
const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 2];   // × real time

const READOUTS = ["MN9 (proboscis)", "Giant Fiber", "descending neurons", "jump muscle MN (TTMn)", "flight power MNs (DLMn)", "leg motor neurons", "wing motor neurons"];
const POP_HELP: Record<string, string> = {
  "sugar GRNs": "Gustatory receptor neurons on the fly's mouthparts and legs that respond to sugar. Firing them is 'tasting sugar'. Real flies respond by extending the proboscis.",
  "bitter GRNs": "Taste neurons that detect bitter compounds. Real flies reject food when these fire; in the model they should shut down the sugar response.",
  "water GRNs": "Taste neurons that respond to water. Thirsty flies extend the proboscis to them.",
  "high-salt GRNs": "Taste neurons (Ir7c / ppk23) that fire to concentrated salt. Real flies reject it; added to sugar it should cut the proboscis response (flybench task 20).",
  "amino-acid GRNs (LB1e)": "Labellar taste neurons the Cell 2026 typing groups as LB1e, responding to amino acids. Only in MaleCNS.",
  "looming (LPLC2/LC4)": "Visual neurons that detect an object rapidly expanding in the eye, i.e. something rushing at the fly. They drive the Giant Fiber escape.",
  "olfactory RNs": "All ~2,300 smell receptor neurons in the antennae at once, an 'every smell simultaneously' input. Real odours activate only a few channels.",
  "JO (antennal mechanosensory)": "Johnston's organ, the ~1,100 neurons in the antenna that sense sound, wind and gravity.",
  "photoreceptors": "All ~11,000 light-sensing cells in both eyes at once, a full-field flash. Not a moving object, so it should not trigger escape.",
  "descending neurons": "The ~1,300 neurons that carry commands from the brain down to the body. Every behaviour goes through them.",
  "MN9 (proboscis)": "Motor neuron 9, which extends the proboscis (the fly's tongue). Its firing means 'feed'.",
  "Giant Fiber": "A pair of huge neurons that trigger the fastest escape a fly has: legs push, wings open, it's airborne in ~10 ms.",
  "jump muscle MN (TTMn)": "The tergotrochanteral motor neuron, in the ventral nerve cord. The giant fiber synapses onto it directly; when it fires, the jump muscle contracts and the fly leaves the ground. Only in MaleCNS, which includes the nerve cord.",
  "flight power MNs (DLMn)": "The dorsal longitudinal motor neurons that drive the big flight muscles. The giant fiber reaches them through one interneuron (the PSI). Only in MaleCNS.",
  "leg motor neurons": "About 275 motor neurons in the nerve cord that move the six legs: flexors, extensors, rotators. Walking would be patterns across these. Only in MaleCNS.",
  "wing motor neurons": "The motor neurons for the wing and flight muscles, including DLMn, DVMn and the steering muscles. Only in MaleCNS.",
};
const STIMULI = ["sugar GRNs", "bitter GRNs", "water GRNs", "high-salt GRNs", "looming (LPLC2/LC4)", "olfactory RNs"];

function PageInner() {
  const workerRef = useRef<Worker | null>(null);
  const activityRef = useRef<Uint8Array | null>(null);
  const lastUi = useRef(0);
  const [dataset, setDataset] = useState("toy");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [positions, setPositions] = useState<Float32Array | null>(null);
  const [classes, setClasses] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState("starting worker…");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [running, setRunning] = useState(true);
  const [gain, setGain] = useState(SHIU_2024.gain);
  const [speedIdx, setSpeedIdx] = useState(2);   // 0.25× real time by default: smooth on most laptops with the real brain
  const [rateHz, setRateHz] = useState(100);
  const [highlight, setHighlight] = useState<Set<number>>(new Set());
  const [showAbout, setShowAbout] = useState(false);
  const [spin, setSpin] = useState(true);
  const [flyMode, setFlyMode] = useState(false);
  const stopSpin = useCallback(() => setSpin(false), []);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [pressed, setPressed] = useState(false);           // has the visitor fired any sense yet
  const [stimEndT, setStimEndT] = useState<number | null>(null);   // sim time when the last stimulus ended
  const urlGain = useRef<number | null>(null);             // ?gain=0.45 from /submit's preview link, or a permalink
  const link = useRef<ExplorerState | null>(null);         // the permalink this page was opened with (applied once the brain loads)
  const [linkTypes, setLinkTypes] = useState<string[]>([]);     // its held cell types, applied by CellTypes when the type table is in
  const [missing, setMissing] = useState<string[]>([]);         // names the link asked for that this dataset lacks
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<{ counts: Uint32Array; sinceMs: number } | null>(null);
  const loading = !meta && !error;

  const send = useCallback((cmd: WorkerCommand, transfer?: Transferable[]) => workerRef.current?.postMessage(cmd, transfer ?? []), []);

  useEffect(() => {
    const w = new Worker(new URL("../workers/lif.worker.ts", import.meta.url));
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<WorkerEvent>) => {
      const e = ev.data;
      if (e.type === "progress") setStatus(e.message);
      else if (e.type === "report") setReport({ counts: e.counts, sinceMs: e.sinceMs });
      else if (e.type === "error") { setError(e.message); setStatus("error"); setRunning(false); }
      else if (e.type === "loaded") {
        setMeta(e.meta); setPositions(e.positions); setClasses(e.classes); setError(null); setDataset(e.meta.name);
        track({ name: "dataset_load", dataset: e.meta.name });
        setStatus(`${e.meta.name}: ${e.meta.n.toLocaleString()} neurons · ${e.meta.n_edges.toLocaleString()} edges`);
        setHistory({});
        const g = urlGain.current ?? DATASETS.find((d) => d.id === e.meta.name)?.gain ?? SHIU_2024.gain;
        urlGain.current = null;
        setGain(g);
        const st = link.current;   // the rest of a permalink: input rate now, held senses and types once the state is in (effects below)
        if (st) {
          if (st.rate !== 100) setRateHz(st.rate);
          if (st.dataset !== e.meta.name && st.dataset !== "toy") setMissing([`dataset ${st.dataset}`]);
        }
        w.postMessage({ type: "params", params: { gain: g } } satisfies WorkerCommand);
        w.postMessage({ type: "speed", target: SPEEDS[2] } satisfies WorkerCommand);
        w.postMessage({ type: "run", running: true } satisfies WorkerCommand);
      } else if (e.type === "frame") {
        activityRef.current = e.activity;          // the 3D view reads this every draw
        w.postMessage({ type: "ack" } satisfies WorkerCommand);
        const now = performance.now();
        if (now - lastUi.current >= 80) {          // sidebar numbers at ~12 Hz is plenty; React re-renders are the expensive part
          lastUi.current = now;
          if (e.activeStims.length) setStimEndT(e.t);   // still stimulating: keep pushing the "ended at" forward
          setFrame(e);
          setHistory((h) => {
            const next = { ...h };
            for (const k of READOUTS) { const arr = (next[k] ?? []).concat(e.rates[k] ?? 0); next[k] = arr.slice(-120); }
            return next;
          });
        }
      }
    };
    // a permalink (or /submit's ?dataset=flywire783&gain=0.42 preview link): dataset, gain, input rate, held senses and cell types
    const st = decodeState(window.location.search, { dataset: "toy", gain: NaN });
    if (st.gain > 0) urlGain.current = st.gain;
    link.current = st;
    const base = DATASETS.some((d) => d.id === st.dataset) ? `/data/${st.dataset}` : "/data/toy";
    w.postMessage({ type: "load", base } satisfies WorkerCommand);
    return () => w.terminate();
  }, []);

  useEffect(() => { send({ type: "params", params: { gain } }); }, [gain, send]);
  const copyLink = () => {
    const pops = new Set(Object.keys(meta?.populations ?? {}));
    const state: ExplorerState = { dataset, gain, rate: rateHz, hold: [...held].filter((h) => pops.has(h)), types: [...held].filter((h) => !pops.has(h)) };
    const url = `${window.location.origin}${window.location.pathname}?${encodeState(state)}`;
    window.history.replaceState(null, "", url);
    navigator.clipboard?.writeText(url).catch(() => {});
    track({ name: "copy_link", dataset, held: state.hold.length + state.types.length });
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  useEffect(() => { send({ type: "speed", target: SPEEDS[speedIdx] }); }, [speedIdx, send]);
  useEffect(() => { send({ type: "run", running }); }, [running, send]);

  const loadDataset = (id: string) => {
    setDataset(id); setMeta(null); setPositions(null); setClasses(null); setFrame(null); setError(null); setStatus("loading…"); setHighlight(new Set());
    activityRef.current = null;
    // a new brain starts with nothing held: the worker drops every stimulus on load, so the UI must too
    setHeld(new Set()); setStimEndT(null); setReport(null); setPressed(false); setMissing([]); setLinkTypes([]);
    setRunning(true);
    send({ type: "load", base: `/data/${id}` });
  };

  const [held, setHeld] = useState<Set<string>>(new Set());
  const heldNeurons = useRef<Map<string, Int32Array>>(new Map());   // what each held name drives (cell types pass their own neuron list)
  const stimulate = (name: string, durationMs = 500, neurons?: Int32Array) => {
    const idx = neurons ?? (meta?.populations[name] ? Int32Array.from(meta.populations[name]) : undefined);
    if (!idx?.length) return;
    setPressed(true);
    if (!neurons) track({ name: "stimulate", population: name, hold: !isFinite(durationMs) });
    send({ type: "stim", name, neurons: idx, rateHz, durationMs });
  };
  const toggleHold = (name: string, neurons?: Int32Array) => {
    if (held.has(name)) {
      heldNeurons.current.delete(name);
      send({ type: "stopStim", name });
      setHeld((prev) => { const s = new Set(prev); s.delete(name); return s; });
    } else {
      const idx = neurons ?? (meta?.populations[name] ? Int32Array.from(meta.populations[name]) : undefined);
      if (!idx?.length) return;
      heldNeurons.current.set(name, idx);
      stimulate(name, Number.POSITIVE_INFINITY, idx);
      setHeld((prev) => new Set(prev).add(name));
    }
  };
  // the worker bakes the input rate into a stimulus when it is added, so a held sense must be re-issued
  // when the slider moves; otherwise the slider says 300 Hz while the held drive stays at 100
  useEffect(() => {
    for (const [name, idx] of heldNeurons.current) send({ type: "stim", name, neurons: idx, rateHz, durationMs: Number.POSITIVE_INFINITY });
  }, [rateHz, send]);
  // apply a permalink's held senses once the brain is in; names this dataset lacks go on the banner, nothing is silently dropped
  useEffect(() => {
    if (!meta || !link.current) return;
    const st = link.current; link.current = null;
    const lacking = missingNames(st.hold, Object.keys(meta.populations));
    if (lacking.length) setMissing((m) => [...m, ...lacking]);
    for (const name of st.hold) if (meta.populations[name]) toggleHold(name);
    if (st.types.length) setLinkTypes(st.types);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);
  const requestReport = useCallback(() => send({ type: "report" }), [send]);
  // fly mode drives named populations at its own rates (the cursor sets the looming rate)
  const stimAt = useCallback((name: string, hz: number, ms: number) => {
    const idx = meta?.populations[name];
    if (!idx?.length) return;
    setPressed(true);
    send({ type: "stim", name, neurons: Int32Array.from(idx), rateHz: hz, durationMs: ms });
  }, [send, meta]);
  const stopStim = useCallback((name: string) => send({ type: "stopStim", name }), [send]);
  const resetBrain = () => { heldNeurons.current.clear(); setHeld(new Set()); setStimEndT(null); setReport(null); send({ type: "reset" }); };
  const releaseAll = () => { held.forEach((name) => send({ type: "stopStim", name })); heldNeurons.current.clear(); setHeld(new Set()); };

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
          <div className="flex items-baseline justify-between"><h1 className="text-lg font-semibold tracking-tight">fly-explorer</h1><Link href="/bench" className="text-xs text-amber-300 hover:text-amber-200">benchmark →</Link></div>
          <p className="text-zinc-400 text-xs mt-1">The real fruit-fly connectome running as a spiking network in your browser. Fire a sense or any cell type, see what the wiring does with it, and notice the one thing it can never do: stop.</p>
        </header>
        <HelpPanel />
        <Guide frame={frame} pressed={pressed} stimEndT={stimEndT} ready={!!meta} dataset={dataset} />

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">connectome</label>
          <Explain title="connectome" text={HELP.connectome}>
            <select value={dataset} disabled={loading} onChange={(e) => loadDataset(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 disabled:opacity-50">
              {DATASETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </Explain>
          <p className="text-xs text-zinc-500">{error ? <span className="text-red-400">couldn&apos;t load: {error}. {dataset !== "toy" && <button className="underline" onClick={() => loadDataset("toy")}>back to toy</button>}</span> : status}</p>
          {missing.length > 0 && <p className="text-xs text-amber-300/90 rounded border border-amber-300/40 bg-amber-300/10 px-2 py-1" data-testid="missing">not in this dataset: {missing.join(", ")} — the link asked for it; nothing was substituted.</p>}
        </section>

        <section className="space-y-2">
          <Explain title="stimulate" text={HELP.stimulate}><label className="text-xs uppercase tracking-wide text-zinc-500 block">stimulate <span className="normal-case tracking-normal text-zinc-600">· press = 500 ms pulse · ⏺ = hold on</span></label></Explain>
          <div className="flex flex-col gap-1">
            {stimSets.filter((s) => STIMULI.includes(s)).concat(stimSets.filter((s) => !STIMULI.includes(s))).map((name) => {
              const on = highlight.size > 0 && (meta?.populations[name] ?? []).every((i) => highlight.has(i));
              return (
                <div key={name} className="flex items-stretch gap-1">
                  <Explain title={name} text={POP_HELP[name] ?? HELP.stimulate}>
                    <button onClick={() => stimulate(name)} disabled={!meta}
                      className={`flex-1 min-w-0 flex items-baseline justify-between gap-2 text-left px-2.5 py-1.5 rounded border border-zinc-700 hover:border-zinc-400 bg-zinc-900 disabled:opacity-40 ${frame?.activeStims.includes(name) ? "bg-amber-300/20 border-amber-300" : ""}`}>
                      <span className="truncate">{name}</span><span className="text-zinc-500 text-xs shrink-0">{meta?.populations[name].length.toLocaleString()}</span>
                    </button>
                  </Explain>
                  <Explain title={`hold ${name}`} text={HELP.hold}>
                    <button aria-label={`hold ${name}`} aria-pressed={held.has(name)} onClick={() => toggleHold(name)} disabled={!meta}
                      className={`w-9 shrink-0 rounded border bg-zinc-900 hover:border-zinc-400 disabled:opacity-40 ${held.has(name) ? "border-amber-300 text-amber-300 bg-amber-300/20" : "border-zinc-700 text-zinc-400"}`}>{held.has(name) ? "■" : "⏺"}</button>
                  </Explain>
                  <Explain title={`highlight ${name}`} text={HELP.highlight}>
                    <button aria-label={`highlight ${name}`} aria-pressed={on} onClick={() => toggleHighlight(name)}
                      className={`w-9 shrink-0 rounded border bg-zinc-900 hover:border-zinc-400 ${on ? "border-cyan-300 text-cyan-300" : "border-zinc-700 text-cyan-300/60"}`}>◉</button>
                  </Explain>
                </div>
              );
            })}
          </div>
          {held.size > 0 && <button onClick={releaseAll} className="px-2.5 py-1.5 rounded border border-amber-300/60 text-amber-300 bg-zinc-900 hover:border-amber-300 text-xs">release all held senses</button>}
          <Explain title="input rate" text={HELP.inputRate}>
            <div className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
              <span className="w-16 whitespace-nowrap">input rate</span>
              <input type="range" min={10} max={300} step={10} value={rateHz} onChange={(e) => setRateHz(+e.target.value)} className="flex-1" aria-label="input rate (Hz)" />
              <EditableValue label="input rate" value={rateHz} min={1} max={500} step={1} onChange={setRateHz} fmt={(v) => `${v} Hz`} className="w-16" />
            </div>
          </Explain>
        </section>

        <CellTypes base={`/data/${dataset}`} ready={!!meta} gain={gain} activeStims={frame?.activeStims ?? []} held={held}
          onFire={(name, neurons, hold) => { track({ name: "cell_type_fire", cellType: name, hold }); return hold ? toggleHold(name, neurons) : stimulate(name, 500, neurons); }}
          requestReport={requestReport} report={report} onClear={() => { send({ type: "clearCounts" }); setReport(null); }}
          initialTypes={linkTypes} onMissing={(names) => setMissing((m) => [...m, ...names])} />

        <section className="space-y-2">
          <Explain title="readouts" text={HELP.readouts}><label className="text-xs uppercase tracking-wide text-zinc-500 block">readouts <span className="normal-case tracking-normal text-zinc-600">· Hz per neuron, last 100 ms</span></label></Explain>
          {readouts.map((k) => (
            <Explain key={k} title={k} text={POP_HELP[k] ?? HELP.readouts}>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleHighlight(k)} className="w-36 truncate text-left hover:text-cyan-300" aria-label={`highlight ${k}`}>{k}</button>
                <Spark values={history[k] ?? []} />
                <span className="w-16 text-right tabular-nums font-mono">{(frame?.rates[k] ?? 0).toFixed(0)}</span>
              </div>
            </Explain>
          ))}
          <Explain title="whole network" text={HELP.network}>
            <div className="flex justify-between text-xs text-zinc-500 pt-1">
              <span>whole network</span><span className="font-mono">{(frame?.networkRate ?? 0).toFixed(2)} Hz</span>
            </div>
          </Explain>
        </section>

        <section className="space-y-2">
          <label className="text-xs uppercase tracking-wide text-zinc-500">model</label>
          <Explain title="gain" text={HELP.gain}><Slider label="gain" value={gain} min={0.1} max={3} step={0.05} onChange={setGain} fmt={(v) => v.toFixed(2) + "×"} /></Explain>
          <Explain title="speed" text={HELP.speed}><Slider label="speed" value={speedIdx} min={0} max={SPEEDS.length - 1} step={1} onChange={setSpeedIdx} fmt={(i) => `${SPEEDS[i]}× real time (target)`} editable={false} /></Explain>
          <div className="flex flex-wrap gap-2 pt-1">
            <Explain title="pause / run" text={HELP.pause}><button onClick={() => setRunning((r) => !r)} disabled={!meta} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400 disabled:opacity-40">{running ? "pause" : "run"}</button></Explain>
            <Explain title="reset" text={HELP.reset}><button onClick={resetBrain} disabled={!meta} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400 disabled:opacity-40">reset</button></Explain>
            <Explain title="gain preset: Shiu 2024" text={HELP.presetShiu}><button onClick={() => setGain(SHIU_2024.gain)} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400">gain: Shiu 2024</button></Explain>
            <Explain title="gain preset: flybench" text={HELP.presetFlybench}><button onClick={() => setGain(0.45)} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400">gain: flybench</button></Explain>
            <Explain title="copy link" text={HELP.copyLink}><button onClick={copyLink} disabled={!meta} className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400 disabled:opacity-40" aria-label="copy link to this experiment">{copied ? "copied ✓" : "copy link"}</button></Explain>
          </div>
          <p className="text-xs text-zinc-500 font-mono">
            t = {((frame?.t ?? 0) / 1000).toFixed(2)} s · asked {SPEEDS[speedIdx]}× · getting {frame?.achieved ? `${frame.achieved.toFixed(2)}×` : "–"}{frame && frame.achieved < SPEEDS[speedIdx] * 0.5 ? <span className="text-amber-300/80"> (brain busy: {frame.firedThisFrame.toLocaleString()} spikes/frame)</span> : null} · {frame?.stepMs.toFixed(2) ?? "–"} ms/step
          </p>
        </section>

        <section className="text-xs text-zinc-400 space-y-1 border-t border-zinc-800 pt-3">
          <button onClick={() => setShowAbout((s) => !s)} className="text-zinc-300 hover:text-white">{showAbout ? "▾" : "▸"} what is this actually showing?</button>
          {showAbout && (
            <div className="space-y-2 leading-relaxed">
              <p>Each dot is a neuron from the FlyWire connectome (or the synthetic toy). Edges are synapse counts; each neuron is the same 5-constant leaky integrate-and-fire unit from Shiu et al. 2024. Nothing is learned or hand-tuned per neuron: when sugar lights up MN9, the wiring did that.</p>
              <p>It is <b>not</b> a fly. No neuromodulators, no gap junctions, no plasticity, no spontaneous activity, no body. Firing rates are only meaningful relative to each other. Nothing in here experiences anything — it is a very large, very fast truth table of &ldquo;if these fire, those fire.&rdquo;</p>
              <p>You will notice that once you poke a sense, part of the brain keeps firing forever. A real fly is back at rest within a second. The model has nothing that can switch a circuit off (no adaptation, no fatigue, no neuromodulation), so the activity is a self-sustaining loop. That is a real result, not a bug; it is measured on the benchmark page as <em>return_to_rest</em>, and it is one of the clearest things a better model would have to fix.</p>
              <p>Benchmark whether a parameter choice still reproduces known reflexes on the <Link href="/bench" className="underline text-amber-300">flybench</Link> page; read <Link href="/limits" className="underline text-amber-300">what this model cannot do</Link>, in the field&apos;s own words; or go to <a href="https://github.com/brandoncho369/fly-explorer" className="underline">GitHub</a>.</p>
            </div>
          )}
        </section>
      </aside>

      <section className="order-1 lg:order-2 relative min-h-[50dvh]">
        <div className={`absolute inset-0 transition-opacity ${flyMode ? "opacity-30 pointer-events-none" : ""}`}>
          {positions && classes ? <Brain positions={positions} classes={classes} activityRef={activityRef} highlight={highlight} spin={spin} onUserRotate={stopSpin} /> : (
            <div className="absolute inset-0 grid place-items-center text-zinc-500 text-sm">{status}</div>
          )}
        </div>
        {flyMode && meta && <FlyMode rates={frame?.rates ?? {}} populations={Object.keys(meta.populations)} stim={stimAt} stop={stopStim} reset={resetBrain} />}
        <Explain title="fly mode" text={HELP.flyMode}>
          <button onClick={() => setFlyMode((v) => { track({ name: "fly_mode", on: !v }); return !v; })} aria-pressed={flyMode} disabled={!meta}
            className={`absolute top-3 left-3 rounded border px-2 py-1 text-xs bg-black/50 disabled:opacity-40 ${flyMode ? "border-amber-300/60 text-amber-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-400"}`}>
            {flyMode ? "🪰 fly mode on" : "🪰 fly mode"}
          </button>
        </Explain>
        <Explain title="spin" text={HELP.spin}>
          <button onClick={() => setSpin((v) => !v)} aria-pressed={spin}
            className={`absolute top-3 right-3 rounded border px-2 py-1 text-xs bg-black/50 ${spin ? "border-amber-300/60 text-amber-300" : "border-zinc-700 text-zinc-400 hover:border-zinc-400"}`}>
            {spin ? "⟳ spinning" : "⟳ spin"}
          </button>
        </Explain>
        <Legend />
      </section>
    </main>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt, editable = true }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; editable?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      <span className="w-14">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="flex-1" aria-label={label} />
      {editable ? <EditableValue label={label} value={value} min={min} max={max} step={step} onChange={onChange} fmt={fmt} /> : <span className="w-24 text-right font-mono">{fmt(value)}</span>}
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
    </div>
  );
}

export default function Page() {
  return (
    <HelpProvider>
      <PageInner />
    </HelpProvider>
  );
}

/**
 * A one-line narrator for first-time visitors. It never explains what the buttons are (the hover help does that);
 * it says what is happening in the fly right now, and it points out the one result people otherwise miss:
 * that activity in this model never stops. Fixed height so it cannot shift the layout.
 */
function Guide({ frame, pressed, stimEndT, ready, dataset }: { frame: Frame | null; pressed: boolean; stimEndT: number | null; ready: boolean; dataset: string }) {
  const mn9 = frame?.rates["MN9 (proboscis)"] ?? 0, gf = frame?.rates["Giant Fiber"] ?? 0, dn = frame?.rates["descending neurons"] ?? 0;
  const ttmn = frame?.rates["jump muscle MN (TTMn)"] ?? 0;
  const net = frame?.networkRate ?? 0;
  const stimming = (frame?.activeStims.length ?? 0) > 0;
  const sinceEndMs = frame && stimEndT != null && !stimming ? frame.t - stimEndT : 0;
  const key = guideKey({ ready, pressed, mn9, gf, dn, net, stimming, sinceEndMs, ttmn });
  const shownNeverStops = useRef(false);
  useEffect(() => { if (key === "never_stops" && !shownNeverStops.current) { shownNeverStops.current = true; track({ name: "guide_never_stops_shown" }); } }, [key]);
  const tone = { never_stops: "text-amber-300", escape: "text-cyan-300", feed: "text-amber-200" }[key as string] ?? "text-zinc-400";
  const text: Record<GuideKey, React.ReactNode> = {
    loading: "loading the brain…",
    prompt: <>Try it: press <b className="text-zinc-200">sugar GRNs</b>, then watch <b className="text-zinc-200">MN9</b> in the readouts.</>,
    never_stops: <>Notice it never stops. {net.toFixed(1)} Hz across the brain, {(sinceEndMs / 1000).toFixed(1)} s after the stimulus ended. A real fly is at rest within a second; this model has nothing that can switch a circuit off. Press <b>reset</b>. flybench scores this as <em>return_to_rest</em>.</>,
    jump: <>The <b>jump muscle motor neuron</b> fired, in the nerve cord. That is the brain reaching the body: the giant fiber&apos;s command arrived at the legs. A real fly is airborne now.</>,
    both: <>Both the escape neuron and the feeding neuron are firing. A real fly never does both at once{dataset === "toy" ? "" : "; the model has lost the ability to say no"}.</>,
    escape: <>The <b>Giant Fiber</b> fired. That is the escape command: a real fly would be airborne in about 10 ms.</>,
    feed: <><b>MN9</b> is firing at {mn9.toFixed(0)} Hz. That is the proboscis motor neuron: a real fly would be extending its mouth toward the sugar right now.</>,
    descending: <>Descending neurons are active: commands are leaving the brain for the body.</>,
    stimulating: <>Sensory neurons are firing. Watch whether the signal reaches a readout.{dataset === "toy" ? "" : " On the real brain at gain 0.45 sugar only reaches MN9 at about 100 Hz input, and at 0.65 the whole brain lights up instead — both are documented flybench findings, not bugs."}</>,
    quiet: <>Quiet. Press a sense, or hold one with ⏺ to keep it on.</>,
  };
  return (
    <div className={`h-20 overflow-hidden rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs leading-relaxed ${tone}`} aria-live="polite" data-testid="guide">
      {text[key]}
    </div>
  );
}
