import type { Metadata } from "next";
import Link from "next/link";
import snapshot from "@/data/leaderboard.json";
import GainChart from "@/components/GainChart";
import { CONNECTOME_NAMES, PRIMARY_CONNECTOME, bestPerGain, byConnectome, gainWindow, otherConnectomes, pct, rankRuns, score2, validateSnapshot, verdict, type Snapshot } from "@/lib/bench";

export const metadata: Metadata = {
  title: "flybench — does the simulated fly still behave like a fly?",
  description: "A reflex benchmark for whole-brain fruit fly connectome simulations: 11 cited behaviours, a reference model, and the finding that FlyWire's 2025 synapse re-prediction halved the working gain.",
};

const REPO = "https://github.com/brandoncho369/flybench";
const snap = snapshot as unknown as Snapshot;
const problems = validateSnapshot(snap);
if (problems.length) throw new Error("leaderboard.json is inconsistent:\n" + problems.join("\n"));

export default function Bench() {
  const primary = byConnectome(snap.runs, PRIMARY_CONNECTOME);
  const runs = rankRuns(primary);
  const tasks = snap.tasks;
  const core = tasks.filter((t) => t.tier === "core"), hard = tasks.filter((t) => t.tier === "hard");
  const win = gainWindow(primary);
  const best = runs[0];
  const sweep = bestPerGain(primary);
  const others = otherConnectomes(snap.runs).map((c) => ({ name: c, title: CONNECTOME_NAMES[c] ?? c, runs: bestPerGain(byConnectome(snap.runs, c)) }));
  const shiu = sweep.find((r) => r.gain === 1);
  const cls = "rounded-lg border border-zinc-800 bg-zinc-900/40";

  return (
    <main className="min-h-dvh bg-[#07080c] text-zinc-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 space-y-12">
        <nav className="flex items-center justify-between text-sm">
          <Link href="/" className="text-zinc-400 hover:text-white">← fly-explorer</Link>
          <div className="flex gap-5 text-zinc-400">
            <Link href="/submit" className="hover:text-white">submit</Link>
            <a href="#leaderboard" className="hover:text-white">leaderboard</a>
            <a href="#tasks" className="hover:text-white">tasks</a>
            <a href={REPO} className="hover:text-white">github</a>
          </div>
        </nav>

        {/* hero: what it is + how to take part, above the fold */}
        <header className="space-y-6">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">flybench</p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight max-w-3xl">Does the simulated fly still do the things a real fly does?</h1>
          <p className="text-zinc-400 max-w-2xl leading-relaxed text-lg">
            An open benchmark for whole-brain fruit fly simulations: {tasks.length} behaviours from the literature, one score per model. The reference model already fails half of them. Beat it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/submit" className="rounded-md bg-amber-300 px-5 py-2.5 text-sm font-semibold text-black hover:bg-amber-200">Submit a result — no install →</Link>
            <a href={`${REPO}/blob/HEAD/CONTRIBUTING.md`} className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 hover:border-zinc-400">Add a task or a model</a>
            <a href={REPO} className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 hover:border-zinc-400">Get the code</a>
            <Link href="/" className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 hover:border-zinc-400">Watch the brain run</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <Stat label="behaviours tested" value={String(tasks.length)} sub={`${core.length} core · ${hard.length} hard`} />
            <Stat label="best hard-tier score" value={score2(best?.hard ?? null)} sub={best ? `${best.label} — beatable` : "—"} accent />
            <Stat label="working gain window" value={win ? `${win.lo}–${win.hi}` : "–"} sub="published value: 1.0" />
            <Stat label="brain firing at gain 1.0" value={shiu ? pct(shiu.max_active) : "–"} sub="on one taste of sugar" />
          </div>
        </header>

        {/* three ways in — short, before any explanation */}
        <section id="contribute" className="space-y-3 scroll-mt-6">
          <h2 className="text-2xl font-semibold tracking-tight">Three ways in</h2>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <Card title="Submit a result" href="/submit">Pick parameters in a form. GitHub opens the pull request, our CI runs the real brain, the scores land on your PR. Nothing to install.</Card>
            <Card title="Add a behaviour" href={`${REPO}/blob/HEAD/CONTRIBUTING.md#2-add-a-task`}>Know a fly reflex with a paper behind it? One YAML file makes it a task. <code>flybench lint</code> checks it.</Card>
            <Card title="Plug in your model" href={`${REPO}/blob/HEAD/CONTRIBUTING.md#3-plug-in-a-different-model`}>Any class with <code>run(duration, stimuli)</code>. Adaptation, gap junctions, neuromodulation: the hard tier is waiting.</Card>
          </div>
          <pre className={`${cls} p-4 text-xs overflow-x-auto leading-relaxed`}><code>{`git clone ${REPO} && cd flybench && pip install -e ".[dev]"
flybench toy && flybench run        # synthetic brain, 10 s — then see the README for the real one
flybench run -c flywire783 --gain 0.42 --seeds 3 -o results/mine.json --label "my run"
flybench submit results/mine.json   # validates, commits, opens the PR`}</code></pre>
        </section>

        {/* finding */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">What it found so far</h2>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            The published model uses gain 1.0. FlyWire re-predicted every synapse in July 2025 and the connections got heavier; nobody re-tuned. On today&apos;s data that gain makes {shiu ? pct(shiu.max_active) : "a fifth"} of the brain fire at a taste of sugar. Sweep the one knob:
          </p>
          <GainChart runs={sweep} window={win} />
          <div className={`${cls} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="text-zinc-500 text-left text-xs uppercase tracking-wide"><tr>
                <th className="p-3">gain</th><th className="p-3">core</th><th className="p-3">hard</th><th className="p-3">brain firing</th><th className="p-3">what happens</th>
              </tr></thead>
              <tbody>
                {sweep.map((r) => (
                  <tr key={r.label} className={`border-t border-zinc-800 ${r.core === 1 ? "bg-amber-300/[0.06]" : ""}`}>
                    <td className="p-3 font-mono">{r.gain.toFixed(2)}{r.gain === 1 && <span className="text-zinc-500 font-sans"> · Shiu 2024</span>}{(r.seeds ?? 1) > 1 && <span className="text-zinc-500 font-sans"> · {r.seeds} seeds</span>}</td>
                    <td className="p-3"><Bar v={r.core ?? 0} /></td><td className="p-3"><Bar v={r.hard ?? 0} /></td>
                    <td className="p-3 font-mono text-zinc-300">{pct(r.max_active)}</td>
                    <td className="p-3 text-zinc-400">{verdict(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            <b className="text-zinc-300">A higher score is not the same as a more accurate fly.</b> It means more of the listed behaviours are reproduced; every row is a hypothesis with its constants attached. Three random seeds sharpen it: 0.40 fires the proboscis on only two of three, so it is a knife edge, while 0.45 passes every core task on every seed. Inside the window the model still fails most of the hard tier, and the starkest failure is the simplest: after a half-second taste of sugar, about 8% of the brain keeps firing at a constant rate forever. A real fly is at rest a second later.
          </p>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            <b className="text-zinc-300">Two things &ldquo;did it fire?&rdquo; cannot see.</b> Counting spikes shows the giant fiber firing 129 times per looming stimulus where the real one fires once, and MN9 at 360 Hz: the reflexes work only in the sense that the wire conducts. And re-running the reflexes on a copy of the brain with every synapse count jittered ±25%, a stand-in for a second individual, shows that at 0.45 escape is robust and taste is a coin flip: one of three jittered brains never extends the proboscis. At gain 1.0 taste becomes robust across individuals, and a fifth of the brain fires. One knob trades robustness for sparseness; no setting buys both; every real fly has both.
          </p>
          <p className="text-zinc-400 max-w-2xl leading-relaxed">
            <b className="text-zinc-300">One real mechanism, and what it does and doesn&apos;t buy.</b> Adding spike-frequency adaptation, a documented property of fly neurons with literature constants applied to every neuron identically, makes the reflexes survive a different individual, returns the brain to rest, brings MN9 down to 48 Hz, and shrinks the looming response from 30% of descending neurons to 13%. It does not fix dose response, does not fix habituation (the second pulse is still 2.5× the first, the opposite of biology), leaves the giant fiber at 116 spikes per loom, and leaves 88% of projection neurons answering one odour. Adaptation explains part of the fly&apos;s robustness and none of its selectivity. That is a research agenda, not a leaderboard win.
          </p>
        </section>

        {/* other connectomes: same instrument, different animal */}
        {others.map((o) => (
          <section key={o.name} className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Same model, {o.name === "malecns" ? "the Minecraft brain" : o.title}</h2>
            {o.name === "malecns" && (
              <p className="text-zinc-400 max-w-2xl leading-relaxed">
                The viral Minecraft and Beat Saber demos ran this same model on Janelia&apos;s <b className="text-zinc-300">male</b> CNS connectome at gain 0.65. We pulled that exact dataset from neuPrint (176k neurons, brain plus nerve cord) and scored it. There is no single gain that works: at 0.45 looming is clean but sugar never reaches the proboscis; at 0.65 sugar works but bitter also triggers feeding, 39% of descending neurons fire at a shadow, and the brain never quiets down. In between, sugar passes on one seed out of three. The taste pathway is also handicapped by the dataset itself: 13% of the male sugar neurons are predicted glutamatergic, which the model treats as inhibitory. Different animal, different annotations, same five constants. Details in <a className="underline hover:text-zinc-300" href={`${REPO}/blob/HEAD/docs/MALECNS.md`}>docs/MALECNS.md</a>.
              </p>
            )}
            <div className={`${cls} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead className="text-zinc-500 text-left text-xs uppercase tracking-wide"><tr>
                  <th className="p-3">gain</th><th className="p-3">core</th><th className="p-3">hard</th><th className="p-3">CNS firing</th><th className="p-3">what happens</th>
                </tr></thead>
                <tbody>
                  {o.runs.map((r) => (
                    <tr key={r.label} className={`border-t border-zinc-800 ${r.core === 1 ? "bg-amber-300/[0.06]" : ""}`}>
                      <td className="p-3 font-mono">{r.gain.toFixed(2)}{r.gain === 0.65 && o.name === "malecns" && <span className="text-zinc-500 font-sans"> · Minecraft demo</span>}{(r.seeds ?? 1) > 1 && <span className="text-zinc-500 font-sans"> · {r.seeds} seeds</span>}</td>
                      <td className="p-3"><Bar v={r.core ?? 0} /></td><td className="p-3"><Bar v={r.hard ?? 0} /></td>
                      <td className="p-3 font-mono text-zinc-300">{pct(r.max_active)}</td>
                      <td className="p-3 text-zinc-400">{verdict(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-600">Rows from other connectomes are separate experiments on the same instrument, not entries in the ranking above: the thresholds were set on FlyWire, and &quot;fraction firing&quot; is over a different denominator (this dataset includes the ventral nerve cord).</p>
          </section>
        ))}

        {/* leaderboard */}
        <section id="leaderboard" className="space-y-3 scroll-mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Leaderboard</h2>
            <span className="text-xs text-zinc-500">{CONNECTOME_NAMES[PRIMARY_CONNECTOME]} · ranked by core, then hard · snapshot {snap.generated}</span>
          </div>
          <p className="text-zinc-500 text-sm max-w-2xl">A model must reproduce the known reflexes before its hard-tier wins count. Submissions are pull requests: CI validates the report, a maintainer re-runs it, and rows that reproduce are marked verified. <a className="underline hover:text-zinc-300" href={`${REPO}/blob/HEAD/CONTRIBUTING.md`}>How to submit →</a></p>
          <div className={`${cls} overflow-x-auto`}>
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="text-zinc-500 text-left text-xs uppercase tracking-wide"><tr>
                <th className="p-3">#</th><th className="p-3">run</th><th className="p-3">model</th><th className="p-3">core</th><th className="p-3">hard</th>
                <th className="p-3" title="graded score: every check scored 0–1 by how far it sits from its threshold (no pass/fail cliff), interquartile mean over tasks, 95% CI from resampling seeds">graded</th>
                <th className="p-3" title="specificity: score on the real wiring minus the best score on shuffled wiring (degree-preserving rewire). Near zero means the tasks were passed by any brain at this gain">spec.</th>
                <th className="p-3">status</th>
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
                    <td className="p-3 font-mono text-zinc-300">{r.graded == null ? <span className="text-zinc-600">–</span> : <>{r.graded.toFixed(2)}{r.graded_ci ? <span className="text-zinc-500 text-xs"> [{r.graded_ci[0].toFixed(2)}, {r.graded_ci[1].toFixed(2)}]</span> : null}</>}</td>
                    <td className="p-3 font-mono text-zinc-300">{r.specificity == null ? <span className="text-zinc-600">–</span> : (r.specificity >= 0 ? "+" : "") + r.specificity.toFixed(2)}</td>
                    <td className="p-3 text-xs">{r.division ? <span className="text-zinc-500" title="closed = reference LIF, gain only; open = other dynamics or fitted constants (declared)">{r.division} · </span> : null}{r.verified ? <span className="text-emerald-300" title="a maintainer re-ran this and got the same scores">✓ verified</span> : <span className="text-zinc-500" title="not yet re-run by a maintainer">self-reported</span>}{r.seeds && r.seeds > 1 ? <span className="text-zinc-500"> · {r.seeds} seeds</span> : ""}</td>
                    <td className="p-3"><Dots run={r} tasks={core} color="amber" /></td>
                    <td className="p-3"><Dots run={r} tasks={hard} color="sky" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-600">Filled dot = task passed; hollow = failed; dashed = task added after this result was run (hover for the task name and partial score). Full per-check values in <a className="underline" href={`${REPO}/blob/HEAD/LEADERBOARD.md`}>LEADERBOARD.md</a> and <code>results/*.json</code>.</p>
        </section>

        {/* tasks */}
        <section id="tasks" className="space-y-6 scroll-mt-6">
          <h2 className="text-2xl font-semibold tracking-tight">The tasks</h2>
          <TaskGroup tier="core" color="amber" title="Core" sub="Reflexes the reference model must reproduce. A model that fails these is broken." tasks={core} />
          <TaskGroup tier="hard" color="sky" title="Hard" sub="Behaviours a wiring diagram plus five constants is not expected to give you. The reference model fails most of these on purpose; they are the research agenda." tasks={hard} />
        </section>

        <footer className="text-xs text-zinc-600 border-t border-zinc-800 pt-4 leading-relaxed">
          Connectome: FlyWire (Dorkenwald et al. 2024; Schlegel et al. 2024). Model: Shiu et al. 2024. Not a fly: no neuromodulation, no plasticity, no body. Nothing in here experiences anything. MIT · <Link className="underline" href="/">fly-explorer</Link> runs the same model live. Built by Brandon Cho (Rice) — <a className="underline" href="mailto:brandon@leafrushmarketing.com">email</a> · <a className="underline" href="https://github.com/brandoncho369">github</a>. If a threshold is wrong, tell me; a citation fixes it in one line.
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
        const why = run.skipped?.[t.name];
        if (why) {
          const na = why.startsWith("not applicable");
          return <span key={t.name} title={`${t.title} · ${na ? "not applicable on this dataset" : "skipped"}: ${why}`} className={`inline-block h-3 w-3 rounded-full border border-dotted ${na ? "border-zinc-500" : "border-zinc-700"}`} aria-label={`${t.name}: ${na ? "not applicable" : "skipped"}`} />;
        }
        if (!x) return <span key={t.name} title={`${t.title} · not run on this result yet (task added later)`} className="inline-block h-3 w-3 rounded-full border border-dashed border-zinc-700" aria-label={`${t.name}: not run`} />;
        const ok = !!x.passed;
        return <span key={t.name} title={`${t.title}${ok ? "" : ` · ${pct(x.score)} of checks`}`} className={`inline-block h-3 w-3 rounded-full border ${ok ? fill : ring}`} aria-label={`${t.name}: ${ok ? "pass" : "fail"}`} />;
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

function Card({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  const cls = "block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-1 hover:border-amber-300/60 transition-colors";
  const inner = <><h3 className="font-medium text-zinc-100">{title} <span className="text-amber-300">→</span></h3><p className="text-zinc-400 leading-relaxed">{children}</p></>;
  return href.startsWith("/") ? <Link href={href} className={cls}>{inner}</Link> : <a href={href} className={cls}>{inner}</a>;
}
