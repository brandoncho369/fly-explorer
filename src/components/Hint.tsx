"use client";
import { createContext, useContext, useState } from "react";

/**
 * Help system: every "?" button sets the active topic; ONE panel (rendered where the
 * layout wants it) shows the explanation. Nothing floats, nothing overlaps, nothing
 * can push the page wider.
 */
interface HelpTopic { title: string; text: string }
const HelpCtx = createContext<{ active: HelpTopic | null; set: (t: HelpTopic | null) => void }>({ active: null, set: () => {} });

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [active, set] = useState<HelpTopic | null>(null);
  return <HelpCtx.Provider value={{ active, set }}>{children}</HelpCtx.Provider>;
}

export default function Hint({ text, title }: { text: string; title: string }) {
  const { active, set } = useContext(HelpCtx);
  const open = active?.title === title;
  return (
    <button
      type="button"
      aria-label={`What is ${title}?`}
      aria-pressed={open}
      onClick={(e) => { e.stopPropagation(); set(open ? null : { title, text }); }}
      className={`ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none align-middle ${open ? "border-amber-300 text-amber-300" : "border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"}`}
    >
      ?
    </button>
  );
}

/** The single panel. Place it once, wherever it should appear. */
export function HelpPanel({ className = "" }: { className?: string }) {
  const { active, set } = useContext(HelpCtx);
  if (!active) return null;
  return (
    <div role="status" className={`rounded border border-amber-300/40 bg-amber-300/[0.06] p-3 text-xs leading-relaxed text-zinc-300 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <b className="text-zinc-100">{active.title}</b>
        <button onClick={() => set(null)} aria-label="close help" className="text-zinc-500 hover:text-zinc-200 leading-none">✕</button>
      </div>
      <p className="mt-1">{active.text}</p>
    </div>
  );
}

/** Plain-English explanations for every control. Keep these honest and short. */
export const HELP = {
  connectome:
    "The wiring diagram being simulated. 'toy' is a 2,000-neuron fake network we hand-wired so the app works instantly. 'FlyWire v783' is the real map of an adult fruit fly brain: 139,255 neurons and 3.7 million connections, traced from electron-microscope images by the FlyWire project.",
  stimulate:
    "Each button fakes a sense. Pressing it makes that group of sensory neurons fire randomly for half a second, the way they would if the fly tasted sugar, saw a shadow rush at it, and so on. Nothing else is scripted: what happens next is decided only by the wiring.",
  inputRate:
    "How hard the stimulated neurons are pushed, in spikes per second per neuron. Real sensory neurons fire anywhere from a few to a few hundred times a second; 100 is a strong but realistic 'taste of sugar'.",
  readouts:
    "The output neurons we watch. MN9 is the motor neuron that extends the proboscis (the fly's tongue); the Giant Fiber is the neuron that triggers a jump-and-fly escape; 'descending neurons' are all ~1,300 neurons that carry commands from the brain to the body. The number is how many times per second each neuron in the group fired, averaged over the last tenth of a second.",
  network:
    "Average firing rate across every neuron in the whole brain. A resting fly brain in this model is 0 Hz (it has no spontaneous activity); a few Hz means a specific circuit is active; tens of Hz means most of the brain is firing, which is a seizure, not a thought.",
  gain:
    "A volume knob on every connection at once. Each synapse adds a fixed voltage kick to the receiving neuron; gain multiplies that kick. Too low and signals die out before reaching the output; too high and everything fires. flybench measured the window where the real reflexes work on this dataset (about 0.4–0.45). The 2024 Nature paper used 1.0 on an older version of the data.",
  speed:
    "How many simulation steps (each 0.1 ms of brain time) to compute per screen frame. 10 means about real time; higher runs the fly faster than life but may stutter on a slow machine.",
  presets:
    "Two gain settings worth comparing. 'Shiu 2024' is 1.0, the value from the Nature paper, which on the current data makes about a fifth of the brain fire at a taste of sugar. 'flybench' is 0.45, the middle of the window where the benchmark's reflex tests pass.",
} as const;
