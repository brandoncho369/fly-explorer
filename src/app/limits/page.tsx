import Link from "next/link";

export const metadata = { title: "What this model cannot do — fly-explorer", description: "The known limits of a connectome-plus-LIF fly brain, in the field's own words, each with the flybench task that measures it." };

const REPO = "https://github.com/brandoncho369/flybench";

/** One limitation: what the field says, what the benchmark measures, what a better model would need. */
interface Limit { title: string; critique: string; who: string; measured: string; task?: string; needs: string }

const LIMITS: Limit[] = [
  {
    title: "A wiring diagram is not a program",
    critique: "Knowing every synapse of the C. elegans nervous system for decades did not by itself yield its function: the same anatomical circuit produces different behaviours depending on neuromodulatory state, and the connectome constrains but does not determine what a network computes.",
    who: "Bargmann & Marder 2013, Nat Methods 10:483 (\"From the connectome to brain function\")",
    measured: "Every hard-tier task is a version of this question. The reference model reproduces the five core reflexes and fails most of the rest; the shuffled-wiring control says how much of each pass is the wiring at all.",
    task: "all",
    needs: "Nothing fixes it in general. Each task names one missing ingredient.",
  },
  {
    title: "Neuromodulation is missing, and it is not a detail",
    critique: "Neuromodulators reconfigure circuits: the same anatomical network can produce several different outputs depending on which modulators are present, so a connectome without its modulatory state is a set of possible circuits, not one.",
    who: "Marder 2012, Neuron 76:1; Bargmann 2012, BioEssays 34:458",
    measured: "Dopamine, octopamine and serotonin neurons are in the graph as ordinary excitatory cells (the model's sign convention). Hunger, arousal and mating state — which gate feeding, halting and egg laying in the fly — have no representation.",
    task: "halt_walk_off, egg_laying_ovidn",
    needs: "A modulatory state with literature constants, applied to a documented target set. Nobody has one for the whole fly.",
  },
  {
    title: "Gap junctions are not in the diagram",
    critique: "The FlyWire and MaleCNS connectomes annotate chemical synapses; electrical synapses are largely invisible to the EM pipeline. The giant fiber's fastest output — to the jump motor neuron — is electrical.",
    who: "Dorkenwald et al. 2024, Nature 634:124 (methods); Allen et al. 2006, Semin Cell Dev Biol 17:31 (the GF–TTMn gap junction)",
    measured: "Task 19 asks for the measured ≈ 0.6 ms giant-fiber-to-jump-muscle latency. A model with one chemical delay per synapse cannot get under ~1.8 ms. It fails, and is meant to: the task names a missing mechanism, not a wrong parameter.",
    task: "gf_to_muscle_latency",
    needs: "An electrical-synapse table from an independent source (dye coupling, innexin expression) and a second edge type in the model.",
  },
  {
    title: "Every neuron is the same point",
    critique: "Fly neurons are electrotonically extended; the location of a synapse on the arbor matters, and dendritic integration in Drosophila central neurons is not a sum of inputs at a point.",
    who: "Gouwens & Wilson 2009, J Neurosci 29:6239; Lesser, Azevedo et al. 2024, Nature 631:369 (motor neuron size and input)",
    measured: "Task 23 ramps a leg's premotor pool and asks for the size principle. The wiring gives large motor neurons proportionally more synapses, so a uniform point model recruits them first — the opposite of the fly. The paper's own inference is that intrinsic properties must compensate; the model has none.",
    task: "leg_mn_size_principle",
    needs: "Per-type intrinsic parameters (input resistance, threshold) measured, not fitted — and a rule for which types get them.",
  },
  {
    title: "Synapse count is not synaptic strength",
    critique: "The number of synaptic contacts between two neurons correlates with functional strength but does not determine it; transmitter identity itself is a prediction from EM images with a stated error rate.",
    who: "Shiu et al. 2024, Nature 634:210 (the weight convention); Eckstein et al. 2024, Cell 187:2574 (transmitter prediction)",
    measured: "Two tasks turned on a single transmitter label: LN23 is glutamatergic in MaleCNS and unlabelled (so excitatory) in FlyWire; ExR6 the reverse. The same circuit fails in opposite directions on the two brains.",
    task: "co2_pathway_specificity, epg_ring_attractor",
    needs: "A documented transmitter-override list as a dataset correction, with its evidence, and physiology for the handful of edges a task hinges on.",
  },
  {
    title: "One animal, and animals vary",
    critique: "Neurons and circuits reach the same function with widely different parameters from animal to animal; a single specimen's numbers are one solution among many.",
    who: "Marder & Goaillard 2006, Nat Rev Neurosci 7:563; Schlegel et al. 2024, Nature 634:139 (hemibrain vs FlyWire)",
    measured: "Task 14 reruns the core reflexes with every synapse count jittered ±25 %. At the working gain, escape survives and taste is a coin flip; there is no gain at which both are robust and the brain stays sparse.",
    task: "wiring_robustness",
    needs: "Homeostatic rules with measured targets — or a second connectome of the same sex to bound the variation directly.",
  },
  {
    title: "It has no eyes, no nose, no body",
    critique: "Behaviour is closed-loop: the fly's own movement changes its sensory input within tens of milliseconds, and a brain scored open-loop on hand-made stimuli is being asked a different question than the animal answers.",
    who: "Lobato-Rios et al. 2022, Nat Methods 19:620 (NeuroMechFly); the digital-sphinx result, bioRxiv 2026.03.20.713233",
    measured: "Every stimulus here is \"the neurons this stimulus would drive, at 100 Hz\": a convention the ratio checks cancel and the rate checks do not. Optic flow is HS and H2 driven directly; an odour is one whole glomerulus.",
    task: "optic_flow_rotation, da1_sparseness",
    needs: "A sensory front end (flyvis for vision) and, eventually, the closed-loop track — with the shuffled-wiring control run alongside, because a body controller can produce realistic behaviour from a worm's connectome.",
  },
  {
    title: "Nothing switches off",
    critique: "Real neurons adapt, synapses depress, and circuits return to rest within a second of a stimulus; a network of memoryless point neurons with recurrent excitation has no state that outlives its membrane time constant.",
    who: "Benda & Herz 2003, Neural Comput 15:2523 (adaptation); Shiu et al. 2024 (the reference model has none)",
    measured: "After a half-second taste of sugar, ~8 % of the brain fires at a constant rate forever. Adding spike-frequency adaptation with two literature constants fixes it and moves the hard tier by +0.15 — and costs the tasks that needed a sustained response.",
    task: "return_to_rest",
    needs: "The mechanism exists; what is missing is the per-type constants and the second mechanism (synaptic depression) that the compass and egg-laying tasks say adaptation alone gets wrong.",
  },
];

export default function Limits() {
  return (
    <main className="min-h-dvh bg-[#07080c] text-zinc-200">
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 space-y-10">
        <nav className="flex items-center justify-between text-sm">
          <Link href="/" className="text-zinc-400 hover:text-white">← fly-explorer</Link>
          <div className="flex gap-5 text-zinc-400">
            <Link href="/bench" className="hover:text-white">benchmark</Link>
            <Link href="/submit" className="hover:text-white">submit</Link>
            <a href={REPO} className="hover:text-white">github</a>
          </div>
        </nav>
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">What this model cannot do</h1>
          <p className="text-zinc-400 leading-relaxed">
            The explorer runs a real connectome through the simplest neuron model that reproduces the fly&apos;s core reflexes. Here is what the field says such a model is missing, in its own words — and, for each, the flybench task that measures the gap and what a better model would need. None of this is a bug. It is the reason the benchmark exists.
          </p>
        </header>
        <ol className="space-y-8">
          {LIMITS.map((l, i) => (
            <li key={l.title} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
              <h2 className="text-lg font-medium"><span className="text-zinc-500 mr-2">{i + 1}.</span>{l.title}</h2>
              <p className="text-zinc-300 leading-relaxed">{l.critique}</p>
              <p className="text-xs text-zinc-500">{l.who}</p>
              <p className="text-sm leading-relaxed"><span className="text-amber-300/90">Measured: </span>{l.measured}{l.task && l.task !== "all" && <> — <Link href="/bench#tasks" className="underline text-zinc-400 hover:text-zinc-200">{l.task}</Link></>}</p>
              <p className="text-sm leading-relaxed text-zinc-400"><span className="text-cyan-300/80">Needs: </span>{l.needs}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Every wrong prediction the benchmark has made is in <a href={`${REPO}/blob/HEAD/docs/FINDINGS.md`} className="underline hover:text-zinc-300">docs/FINDINGS.md</a>; every task&apos;s pre-registered prediction and outcome in <a href={`${REPO}/tree/HEAD/docs/rfcs`} className="underline hover:text-zinc-300">docs/rfcs</a>. If a critique here misquotes its source, open an issue.
        </p>
      </div>
    </main>
  );
}
