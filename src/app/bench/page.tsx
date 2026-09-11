import type { Metadata } from "next";
import Link from "next/link";
import snapshot from "@/data/leaderboard.json";
import GainChart from "@/components/GainChart";
import { gainWindow, pct, rankRuns, score2, validateSnapshot, verdict, type Snapshot } from "@/lib/bench";

export const metadata: Metadata = {
  title: "flybench — does the simulated fly still behave like a fly?",
  description: "A reflex benchmark for whole-brain fruit fly connectome simulations: 11 cited behaviours, a reference model, and the finding that FlyWire's 2025 synapse re-prediction halved the working gain.",
};

const REPO = "https://github.com/brandoncho369/flybench";
const snap = snapshot as unknown as Snapshot;
const problems = validateSnapshot(snap);
if (problems.length) throw new Error("leaderboard.json is inconsistent:\n" + problems.join("\n"));

export default function Bench() {
  const runs = rankRuns(snap.runs);
  const tasks = snap.tasks;
  const core = tasks.filter((t) => t.tier === "core"), hard = tasks.filter((t) => t.tier === "hard");
  const win = gainWindow(snap.runs);
  const best = runs[0];
  const shiu = snap.runs.find((r) => r.gain === 1);
  const cls = "rounded-lg border border-zinc-800 bg-zinc-900/40";

  return (
    <main className="min-h-dvh bg-[#07080c] text-zinc-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-12">
        <nav className="flex items-center justify-between text-sm">
          <Link href="/" className="text-zinc-400 hover:text-white">← fly-explorer</Link>
          <div className="flex gap-5 text-zinc-400">
            <a href="#leaderboard" className="hover:text-white">leaderboard</a>
            <a href="#tasks" className="hover:text-white">tasks</a>
            <a href={REPO} className="hover:text-white">github</a>
          </div>
        </nav>

        {/* hero */}
        <header className="space-y-5">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">flybench</p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight max-w-3xl">Does the simulated fly still do the things a real fly does?</h1>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            FlyWire mapped every neuron and synapse in a fruit fly brain. Anyone can drop that map into a spiking-neuron model and wire it to a game; every one of those demos hand-tunes the same knobs until something looks alive. flybench replaces the vibe with a score: {tasks.length} behaviours from the fly literature, each with a stimulus, a readout and a threshold.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <Stat label="behaviours tested" value={String(tasks.length)} sub={`${core.length} core · ${hard.length} hard`} />
            <Stat label="working gain window" value={win ? `${win.lo}–${win.hi}` : "–"} sub="published value: 1.0" accent />
            <Stat label="reference model, hard tier" value={score2(best?.hard ?? null)} sub={`core ${score2(best?.core ?? null)}`} />
            <Stat label="brain firing at gain 1.0" value={shiu ? pct(shiu.max_active) : "–"} sub="on one taste of sugar" />
          </div>
        </header>

        {/* finding */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">The finding so far</h2>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            The 2024 <em>Nature</em> model (Shiu et al.) uses one global synaptic gain, 1.0. In July 2025 FlyWire re-predicted every synapse with a new method and the connections came out heavier. Nobody re-tuned. On today&apos;s data, gain 1.0 makes {shiu ? pct(shiu.max_active) : "a fifth"} of the brain fire at a taste of sugar. Sweep only that one knob and the reflexes come and go:
          </p>
          <GainChart runs={snap.runs} window={win} />
          <div className={`${cls} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="text-zinc-500 text-left text-xs uppercase tracking-wide"><tr>
                <th className="p-3">gain</th><th className="p-3">core</th><th className="p-3">hard</th><th className="p-3">brain firing</th><th className="p-3">what happens</th>
              </tr></thead>
              <tbody>
                {[...snap.runs].sort((a, b) => a.gain - b.gain).map((r) => (
                  <tr key={r.label} className={`border-t border-zinc-800 ${r.core === 1 ? "bg-amber-300/[0.06]" : ""}`}>
                    <td className="p-3 font-mono">{r.gain.toFixed(2)}{r.gain === 1 && <span className="text-zinc-500 font-sans"> · Shiu 2024</span>}</td>
                    <td className="p-3"><Bar v={r.core ?? 0} /></td><td className="p-3"><Bar v={r.hard ?? 0} /></td>
                    <td className="p-3 font-mono text-zinc-300">{pct(r.max_active)}</td>
                    <td className="p-3 text-zinc-400">{verdict(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            Inside the window the reference model then fails most of the hard tier, and every failure names something a better model has to add: the proboscis response is all-or-nothing (no dose response), a second sugar pulse gets exactly the response of the first (no adaptation), one odour channel lights up 84% of all olfactory projection neurons (no lateral inhibition), and looming recruits a third of all descending neurons (no selectivity).
          </p>
        </section>

        {/* leaderboard */}
        <section id="leaderboard" className="space-y-3 scroll-mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Leaderboard</h2>
            <span className="text-xs text-zinc-500">ranked by core, then hard · snapshot {snap.generated}</span>
          </div>
          <p className="text-zinc-500 text-sm max-w-2xl">A model must reproduce the known reflexes before its hard-tier wins count. Every row so far is the reference LIF model at a different gain on FlyWire v783. <a className="underline hover:text-zinc-300" href={`${REPO}/blob/main/CONTRIBUTING.md`}>Submit yours</a> with a pull request.</p>
          <div className={`${cls} overflow-x-auto`}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-zinc-500 text-left text-xs uppercase tracking-wide"><tr>
                <th className="p-3">#</th><th className="p-3">run</th><th className="p-3">model</th><th className="p-3">core</th><th className="p-3">hard</th>
                <th className="p-3 font-normal normal-case tracking-normal text-zinc-600"><span className="text-amber-300/80">●</span> core tasks</th>
                <th className="p-3 font-normal normal-case tracking-normal text-zinc-600"><span className="text-sky-300/80">●</span> hard tasks</th>
              </tr></thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={r.label} className={`border-t border-zinc-800 ${i === 0 ? "bg-amber-300/[0.06]" : ""}`}>
                    <td className="p-3 text-zinc-500">{i + 1}</td>
                    <td className="p-3">{r.label}</td>
                    <td className="p-3 text-zinc-400">{r.simulator}</td>
                    <td className="p-3 font-mono">{score2(r.core)}</td>
                    <td className="p-3 font-mono">{score2(r.hard)}</td>
                    <td className="p-3"><Dots run={r} tasks={core} color="amber" /></td>
                    <td className="p-3"><Dots run={r} tasks={hard} color="sky" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-600">Filled dot = task passed; hollow = failed (hover for the task name and partial score). Full per-check values in <a className="underline" href={`${REPO}/blob/main/LEADERBOARD.md`}>LEADERBOARD.md</a> and <code>results/*.json</code>.</p>
        </section>

        {/* tasks */}
        <section id="tasks" className="space-y-6 scroll-mt-6">
          <h2 className="text-2xl font-semibold tracking-tight">The tasks</h2>
          <TaskGroup tier="core" color="amber" title="Core" sub="Reflexes the reference model must reproduce. A model that fails these is broken." tasks={core} />
          <TaskGroup tier="hard" color="sky" title="Hard" sub="Behaviours a wiring diagram plus five constants is not expected to give you. The reference model fails most of these on purpose; they are the research agenda." tasks={hard} />
        </section>

        {/* run it */}
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">Run it yourself</h2>
          <pre className={`${cls} p-4 text-xs overflow-x-auto leading-relaxed`}><code>{`git clone ${REPO} && cd flybench && pip install -e ".[dev]"
flybench toy && flybench run                 # 2k-neuron synthetic brain, ~10 s
# the real brain: six CSVs from codex.flywire.ai (free account), then
flybench build data/ && flybench run -c flywire783 --gain 0.45 --tier all`}</code></pre>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <Card title="Submit a result">Run with your parameters, add the JSON report to <code>results/</code>, open a PR. State what you changed.</Card>
            <Card title="Add a task">One YAML file: a stimulus, a readout, checks, and a citation to published fly behaviour. <code>flybench lint</code> checks it.</Card>
            <Card title="Plug in a model">Any class with <code>run(duration_ms, stimuli)</code>. Use <code>--simulator mymodule:MyModel</code>; the leaderboard records which model produced each row.</Card>
          </div>
          <p className="text-xs text-zinc-500 max-w-2xl">Never tune per-neuron parameters to pass a task; that is fitting the test, and it defeats the point. Details in <a className="underline" href={`${REPO}/blob/main/CONTRIBUTING.md`}>CONTRIBUTING.md</a>.</p>
        </section>

        <footer className="text-xs text-zinc-600 border-t border-zinc-800 pt-4 leading-relaxed">
          Connectome: FlyWire (Dorkenwald et al. 2024; Schlegel et al. 2024). Model: Shiu et al. 2024. Not a fly: no neuromodulation, no plasticity, no body. Nothing in here experiences anything. MIT · <Link className="underline" href="/">fly-explorer</Link> runs the same model live.
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-2xl sm:text-3xl font-semibold tracking-tight mt-1 font-mono ${accent ? "text-amber-300" : "text-zinc-100"}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function Bar({ v }: { v: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-amber-300" style={{ width: `${Math.round(v * 100)}%` }} /></div>
      <span className="font-mono text-xs text-zinc-300 w-8">{v.toFixed(2)}</span>
    </div>
  );
}

function Dots({ run, tasks, color }: { run: Snapshot["runs"][number]; tasks: Snapshot["tasks"]; color: "amber" | "sky" }) {
  const fill = color === "amber" ? "bg-amber-300 border-amber-300" : "bg-sky-300 border-sky-300";
  const ring = color === "amber" ? "border-amber-300/50" : "border-sky-300/50";
  return (
    <span className="flex gap-1.5">
      {tasks.map((t) => {
        const x = run.tasks[t.name];
        const ok = !!x?.passed;
        return <span key={t.name} title={`${t.title}${ok ? "" : x ? ` · ${pct(x.score)} of checks` : " · no result"}`} className={`inline-block h-3 w-3 rounded-full border ${ok ? fill : ring}`} aria-label={`${t.name}: ${ok ? "pass" : "fail"}`} />;
      })}
    </span>
  );
}

function TaskGroup({ title, sub, tasks, color }: { tier: string; title: string; sub: string; tasks: Snapshot["tasks"]; color: "amber" | "sky" }) {
  const dot = color === "amber" ? "bg-amber-300" : "bg-sky-300";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} /><h3 className="text-lg font-medium">{title}</h3></div>
      <p className="text-sm text-zinc-500 max-w-2xl">{sub}</p>
      <div className="grid md:grid-cols-2 gap-3">
        {tasks.map((t) => (
          <article key={t.name} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h4 className="font-medium leading-snug">{t.title}</h4>
              <code className="text-[10px] text-zinc-500 shrink-0 pt-1">{t.name}</code>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">{t.description}</p>
            <p className="text-xs text-zinc-500">{t.citation}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-1">
      <h3 className="font-medium">{title}</h3>
      <p className="text-zinc-400 leading-relaxed">{children}</p>
    </div>
  );
}
