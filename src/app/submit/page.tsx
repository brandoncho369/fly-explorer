"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Zero-install submission. The form writes a flybench submission config; the button opens
 * GitHub's "create new file" editor pre-filled with it, in a fork if needed. Submitting that
 * file as a pull request makes CI evaluate it on the real connectome and comment the scores.
 */
const OWNER = "brandoncho369", REPO = "flybench";
const SIMULATORS = [
  { id: "flybench.sim:LIFSimulator", label: "Reference LIF (Shiu 2024 constants)", extra: [] as { key: string; label: string; def: number; min: number; max: number; step: number; help: string }[] },
  {
    id: "flybench.models.adaptive_lif:AdaptiveLIFSimulator", label: "Adaptive LIF (adds spike-frequency adaptation)",
    extra: [
      { key: "b_mv", label: "adaptation per spike (mV)", def: 2, min: 0.1, max: 10, step: 0.1, help: "How much each spike tires the neuron. Literature: a few mV." },
      { key: "tau_a_ms", label: "adaptation decay (ms)", def: 200, min: 20, max: 2000, step: 10, help: "How long the tiredness lasts. Literature: 100–500 ms." },
    ],
  },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "submission";
const LABEL_RE = /^[A-Za-z0-9 ._,()+\/-]{1,60}$/;

export default function Submit() {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [gain, setGain] = useState(0.45);
  const [seeds, setSeeds] = useState(3);
  const [simIdx, setSimIdx] = useState(0);
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [branch, setBranch] = useState("main");
  const sim = SIMULATORS[simIdx];

  useEffect(() => {
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}`).then((r) => r.json()).then((j) => { if (j?.default_branch) setBranch(j.default_branch); }).catch(() => {});
  }, []);
  const pickSim = (i: number) => { setSimIdx(i); setExtra(Object.fromEntries(SIMULATORS[i].extra.map((e) => [e.key, e.def]))); };

  const yaml = useMemo(() => {
    const lines = [`label: ${label || "…"}`, `note: ${note.replace(/\n/g, " ") || "…"}`, "connectome: flywire783", `seeds: ${seeds}`, "params:", `  gain: ${gain}`];
    if (sim.extra.length) { lines.push("  extra:"); for (const e of sim.extra) lines.push(`    ${e.key}: ${extra[e.key] ?? e.def}`); }
    lines.push(`simulator: ${sim.id}`);
    return lines.join("\n") + "\n";
  }, [label, note, gain, seeds, sim, extra]);

  const problems: string[] = [];
  if (!LABEL_RE.test(label)) problems.push("label: 1–60 characters; letters, digits, spaces and . _ , ( ) + / -");
  if (!note.trim()) problems.push("note: say what you changed, in one line");
  if (note.length > 300) problems.push("note: max 300 characters");
  const ok = problems.length === 0;
  const href = `https://github.com/${OWNER}/${REPO}/new/${branch}?filename=${encodeURIComponent(`configs/submissions/${slug(label)}.yaml`)}&value=${encodeURIComponent(yaml)}`;
  const field = "w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 outline-none";

  return (
    <main className="min-h-dvh bg-[#07080c] text-zinc-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-8">
        <nav className="flex items-center justify-between text-sm">
          <Link href="/bench" className="text-zinc-400 hover:text-white">← flybench</Link>
          <a href={`https://github.com/${OWNER}/${REPO}/blob/HEAD/CONTRIBUTING.md`} className="text-zinc-400 hover:text-white">other ways to contribute</a>
        </nav>
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">submit a result</p>
          <h1 className="text-3xl font-semibold tracking-tight">Pick parameters. We run the brain.</h1>
          <p className="text-zinc-400 leading-relaxed max-w-2xl">Nothing to install and nothing to download. This form writes a small config file; GitHub opens it as a pull request (it makes a fork for you if you need one); our CI runs the full 12-task suite on the real FlyWire connectome with your settings and comments the scores on the PR. When it&apos;s merged, your row appears on the leaderboard marked <span className="text-emerald-300">verified</span>.</p>
        </header>

        <section className="grid md:grid-cols-[1fr_1fr] gap-6">
          <div className="space-y-4">
            <Field label="label" hint="shown on the leaderboard; make it yours">
              <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. jane · LIF gain 0.42" maxLength={60} />
            </Field>
            <Field label="what you changed" hint="one line; this is what other people read">
              <input className={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. gain 0.42, otherwise Shiu 2024 defaults" maxLength={300} />
            </Field>
            <Field label="model" hint="built-in simulators only; custom code goes through a normal PR">
              <select className={field} value={simIdx} onChange={(e) => pickSim(+e.target.value)}>
                {SIMULATORS.map((s, i) => <option key={s.id} value={i}>{s.label}</option>)}
              </select>
            </Field>
            <Field label={`gain · ${gain.toFixed(2)}×`} hint="volume knob on every synapse. 1.0 is the 2024 paper; 0.45 is the robust window on today's data">
              <input type="range" min={0.1} max={2} step={0.01} value={gain} onChange={(e) => setGain(+e.target.value)} className="w-full" aria-label="gain" />
            </Field>
            {sim.extra.map((e) => (
              <Field key={e.key} label={`${e.label} · ${extra[e.key] ?? e.def}`} hint={e.help}>
                <input type="range" min={e.min} max={e.max} step={e.step} value={extra[e.key] ?? e.def} onChange={(ev) => setExtra({ ...extra, [e.key]: +ev.target.value })} className="w-full" aria-label={e.label} />
              </Field>
            ))}
            <Field label={`seeds · ${seeds}`} hint="random repeats; a check only passes if it holds on every seed. 3 is the standard">
              <input type="range" min={1} max={5} step={1} value={seeds} onChange={(e) => setSeeds(+e.target.value)} className="w-full" aria-label="seeds" />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">the file GitHub will open for you</p>
            <pre className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300 overflow-x-auto leading-relaxed" data-testid="yaml">{yaml}</pre>
            {problems.length > 0 && <ul className="text-xs text-amber-300 space-y-1">{problems.map((p) => <li key={p}>· {p}</li>)}</ul>}
            <Link href={`/?dataset=flywire783&gain=${gain}`} target="_blank" className="block text-center rounded-md border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 hover:border-zinc-400">
              Watch this gain in the explorer first →
            </Link>
            <a href={ok ? href : undefined} aria-disabled={!ok} target="_blank" rel="noreferrer"
              className={`block text-center rounded-md px-5 py-3 text-sm font-semibold ${ok ? "bg-amber-300 text-black hover:bg-amber-200" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"}`}>
              Open pull request on GitHub →
            </a>
            <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
              <li>GitHub opens with the file pre-filled (sign in if asked; it forks the repo for you).</li>
              <li>Click <b className="text-zinc-300">Propose changes</b>, then <b className="text-zinc-300">Create pull request</b>. Don&apos;t edit anything.</li>
              <li>Within ~10 minutes a bot comments the scores on your PR.</li>
              <li>When a maintainer merges it, your row is live on <Link className="underline" href="/bench">the leaderboard</Link>.</li>
            </ol>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400 leading-relaxed space-y-2">
          <p className="text-zinc-200 font-medium">What a higher score means, and what it doesn&apos;t</p>
          <p>A score counts how many of the listed fly behaviours the model reproduces. It does not say the model is closer to a real fly&apos;s biology. A model can pass more tasks by adding a mechanism flies don&apos;t have, or by adding a real one with the wrong numbers. Treat every row as a hypothesis with its own evidence: the note, the constants, and which tasks moved. The benchmark is a way to argue with numbers, not a verdict.</p>
        </section>
      </div>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
      <span className="block text-xs text-zinc-500">{hint}</span>
    </label>
  );
}
