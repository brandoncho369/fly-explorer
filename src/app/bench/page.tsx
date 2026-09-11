import type { Metadata } from "next";
import Link from "next/link";
import snapshot from "@/data/leaderboard.json";

export const metadata: Metadata = {
  title: "flybench — reflex benchmark for fly connectome simulations",
  description: "Does the simulated fly still do the things a real fly does? Eleven cited behavioural tasks, a reference model, and the finding that FlyWire's 2025 synapse re-prediction halved the working gain.",
};

const REPO = "https://github.com/brandoncho369/flybench";

interface Run {
  label: string; connectome: string; simulator: string; gain: number; w_syn: number;
  core: number | null; hard: number | null; max_active: number;
  tasks: Record<string, { passed: boolean; score: number; checks: { d: string; v: number; ok: boolean }[] }>;
}
interface Task { name: string; title: string; tier: string; description: string; citation: string }

const fmt = (v: number | null) => (v == null ? "–" : v.toFixed(2));

export default function Bench() {
  const runs = [...(snapshot.runs as Run[])].sort((a, b) => (b.core ?? 0) - (a.core ?? 0) || (b.hard ?? 0) - (a.hard ?? 0));
  const tasks = snapshot.tasks as Task[];
  const core = tasks.filter((t) => t.tier === "core"), hard = tasks.filter((t) => t.tier === "hard");
  const best = runs[0];

  return (
    <main className="min-h-dvh bg-[#07080c] text-zinc-200 px-4 sm:px-8 py-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <nav className="flex items-center justify-between text-sm">
          <Link href="/" className="text-zinc-400 hover:text-white">← fly-explorer</Link>
          <div className="flex gap-4 text-zinc-400">
            <a href={REPO} className="hover:text-white">github</a>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`} className="hover:text-white">contribute</a>
          </div>
        </nav>

        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">flybench</h1>
          <p className="text-lg text-zinc-300 max-w-3xl">Does the simulated fly still do the things a real fly is known to do?</p>
          <p className="text-zinc-400 max-w-3xl leading-relaxed">
            FlyWire published the wiring diagram of a whole fruit fly brain. Anyone can drop it into a spiking-neuron model and wire it to a game; every one of those demos hand-tunes the same knobs until something looks alive. flybench is a test suite: {tasks.length} behaviours from the fly literature, each with a stimulus, a readout and a threshold, so any model gets a score instead of a vibe.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">The finding so far</h2>
          <p className="text-zinc-400 max-w-3xl leading-relaxed">
            The 2024 <em>Nature</em> model (Shiu et al.) uses a global synaptic gain of 1.0. In July 2025 FlyWire re-predicted every synapse with a new method and the connections came out heavier. On today&apos;s data, gain 1.0 makes a fifth of the brain fire at a taste of sugar. Sweeping only that one knob:
          </p>
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-zinc-400 text-left"><tr>
                <th className="p-2">gain</th><th className="p-2">core reflexes</th><th className="p-2">hard behaviours</th><th className="p-2">brain awake (peak)</th><th className="p-2">verdict</th>
              </tr></thead>
              <tbody>
                {[...runs].sort((a, b) => a.gain - b.gain).map((r) => {
                  const ok = r.core === 1;
                  const verdict = r.gain < 0.4 ? "taste pathway never reaches the proboscis" : ok ? "passes every known reflex" : r.gain >= 0.7 ? "too much of the brain fires" : "bitter can no longer cancel sugar";
                  return (
                    <tr key={r.label} className={`border-t border-zinc-800 ${ok ? "bg-amber-300/5" : ""}`}>
                      <td className="p-2 font-mono">{r.gain.toFixed(2)}{r.gain === 1 && <span className="text-zinc-500"> (Shiu 2024)</span>}</td>
                      <td className="p-2 font-mono">{fmt(r.core)}</td><td className="p-2 font-mono">{fmt(r.hard)}</td>
                      <td className="p-2 font-mono">{(r.max_active * 100).toFixed(0)}%</td><td className="p-2 text-zinc-400">{verdict}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-zinc-400 max-w-3xl leading-relaxed">
            The working window is <b className="text-zinc-200">gain ≈ 0.40–0.45</b>, less than half the published value. Inside it the reference model then fails most of the hard tier: the proboscis response is all-or-nothing, a second sugar pulse gets exactly the response of the first, one odour channel lights up 84% of all olfactory projection neurons, and looming recruits a third of all descending neurons. Each failure is a specific thing a better model has to add.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Leaderboard</h2>
          <p className="text-zinc-500 text-sm">Ranked by core score, then hard score. A model must reproduce the known reflexes before its hard-tier wins count. All rows so far are the reference LIF model at different gains on FlyWire v783; submit yours via pull request.</p>
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-zinc-900 text-zinc-400 text-left"><tr>
                <th className="p-2">run</th><th className="p-2">model</th><th className="p-2">gain</th><th className="p-2">core</th><th className="p-2">hard</th>
                {tasks.map((t) => <th key={t.name} className="p-2 font-normal text-xs" title={t.title}>{t.name.replace(/_/g, " ")}</th>)}
              </tr></thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={r.label} className={`border-t border-zinc-800 ${i === 0 ? "bg-amber-300/5" : ""}`}>
                    <td className="p-2">{r.label}</td><td className="p-2 text-zinc-400">{r.simulator}</td><td className="p-2 font-mono">{r.gain}</td>
                    <td className="p-2 font-mono">{fmt(r.core)}</td><td className="p-2 font-mono">{fmt(r.hard)}</td>
                    {tasks.map((t) => { const x = r.tasks[t.name]; return <td key={t.name} className="p-2 text-center">{!x ? "–" : x.passed ? "✅" : <span className="text-zinc-500">{Math.round(x.score * 100)}%</span>}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-600">snapshot {snapshot.generated} · {best ? `${best.label}: core ${fmt(best.core)} / hard ${fmt(best.hard)}` : ""} · <a className="underline" href={`${REPO}/blob/main/LEADERBOARD.md`}>live table on GitHub</a></p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">The tasks</h2>
          <TaskList title="Core — reflexes the reference model must reproduce" tasks={core} note="A model that fails these is broken." />
          <TaskList title="Hard — behaviours a wiring diagram alone is not expected to give you" tasks={hard} note="The reference model fails most of these on purpose. They are the research agenda." />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Run it yourself</h2>
          <pre className="rounded border border-zinc-800 bg-zinc-900 p-3 text-xs overflow-x-auto"><code>{`git clone ${REPO} && cd flybench && pip install -e ".[dev]"
flybench toy && flybench run              # 2k-neuron synthetic brain, 10 s
# real brain: download six CSVs from codex.flywire.ai (free), then
flybench build data/ && flybench run -c flywire783 --gain 0.45 --tier all`}</code></pre>
          <p className="text-zinc-400 max-w-3xl leading-relaxed text-sm">
            Three ways to contribute: submit a result (your parameters, a JSON report, a PR), add a task (one YAML file with a citation), or plug in a different model (<code className="text-zinc-300">--simulator mymodule:MyModel</code>). Details in <a className="underline" href={`${REPO}/blob/main/CONTRIBUTING.md`}>CONTRIBUTING.md</a>. Never tune per-neuron parameters to pass a task; that is fitting the test.
          </p>
        </section>

        <footer className="text-xs text-zinc-600 border-t border-zinc-800 pt-4">
          Connectome: FlyWire (Dorkenwald et al. 2024; Schlegel et al. 2024). Model: Shiu et al. 2024. Not a fly: no neuromodulation, no plasticity, no body. Nothing in here experiences anything. MIT.
        </footer>
      </div>
    </main>
  );
}

function TaskList({ title, tasks, note }: { title: string; tasks: Task[]; note: string }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-zinc-300">{title}</h3>
      <p className="text-xs text-zinc-500">{note}</p>
      <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
        {tasks.map((t) => (
          <li key={t.name} className="p-3 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2"><span className="font-medium">{t.title}</span><code className="text-xs text-zinc-500">{t.name}</code></div>
            <p className="text-sm text-zinc-400 leading-relaxed">{t.description}</p>
            <p className="text-xs text-zinc-500">{t.citation}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
