"use client";
import { createContext, useContext, useState } from "react";

/**
 * Hover-to-explain help. Wrap any control in <Explain topic text>; when the user
 * hovers or focuses it, ONE panel under the page title shows the explanation.
 * No icons, nothing floating, nothing that can overlap or widen the page.
 */
interface HelpTopic { title: string; text: string }
interface Ctx { active: HelpTopic | null; set: (t: HelpTopic | null) => void; enabled: boolean; setEnabled: (v: boolean) => void }
const HelpCtx = createContext<Ctx>({ active: null, set: () => {}, enabled: true, setEnabled: () => {} });

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [active, set] = useState<HelpTopic | null>(null);
  const [enabled, setEnabled] = useState(true);
  return <HelpCtx.Provider value={{ active, set, enabled, setEnabled }}>{children}</HelpCtx.Provider>;
}

/** Wrap a control. Hover/focus shows its explanation in the panel; tap on touch devices does too. */
export function Explain({ title, text, children, className = "" }: { title: string; text: string; children: React.ReactNode; className?: string }) {
  const { set } = useContext(HelpCtx);
  const show = () => set({ title, text });
  return (
    <div className={`contents ${className}`} onMouseEnter={show} onFocusCapture={show} onTouchStart={show}>
      {children}
    </div>
  );
}

/** The single panel. Place it once, wherever it should appear. */
export function HelpPanel({ className = "" }: { className?: string }) {
  const { active, enabled, setEnabled } = useContext(HelpCtx);
  return (
    // Fixed height on purpose: the panel sits above the controls, so if it grew or shrank with the
    // text, everything below would jump under the cursor at the moment of hovering.
    <div className={`h-28 overflow-hidden rounded border p-3 text-xs leading-relaxed ${enabled && active ? "border-amber-300/40 bg-amber-300/[0.06] text-zinc-300" : "border-zinc-800 bg-zinc-900/40 text-zinc-500"} ${className}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <b className={`truncate ${enabled && active ? "text-zinc-100" : "text-zinc-400"}`}>{enabled ? (active ? active.title : "help") : "help is off"}</b>
        <button onClick={() => setEnabled(!enabled)} aria-pressed={enabled} className="shrink-0 text-zinc-500 hover:text-zinc-200 leading-none">{enabled ? "turn off" : "turn on"}</button>
      </div>
      {enabled && <p className="mt-1 h-[4.5rem] overflow-y-auto pr-1">{active ? active.text : "Hover over any control to see what it does, in plain English."}</p>}
    </div>
  );
}

/** Plain-English explanations for every control. Keep these honest and short. */
export const HELP = {
  connectome:
    "The wiring diagram being simulated. 'toy' is a 2,000-neuron fake network we hand-wired so the app works instantly. 'FlyWire v783' is the real map of an adult fruit fly brain: 139,255 neurons and 3.7 million connections, traced from electron-microscope images by the FlyWire project.",
  stimulate:
    "Each row fakes a sense. The main button fires that group of sensory neurons randomly for half a second, the way they would if the fly tasted sugar, saw a shadow rush at it, and so on. The ⏺ button holds the sense on until you press it again, so you can layer senses: hold sugar, then hold bitter, and watch whether bitter can push the proboscis neuron back down. Nothing else is scripted: what happens next is decided only by the wiring.",
  hold:
    "Hold this sense on continuously instead of a half-second pulse. Press again to release. Use it to overlap two senses (hold sugar, then hold bitter) — that overlap is how flybench tests bitter suppression.",
  highlight:
    "Mark these neurons in cyan in the 3D view so you can see where they sit. Small groups (MN9 and the Giant Fiber are two neurons each, one per side) get a ring so they are findable among 140k dots; big groups get a dot per neuron. Click again to clear. The bright white spots you may see are not activity: they are dense clusters of cell bodies adding up on screen.",
  inputRate:
    "How hard the stimulated neurons are pushed, in spikes per second per neuron. Real sensory neurons fire anywhere from a few to a few hundred times a second; 100 is a strong but realistic 'taste of sugar'.",
  readouts:
    "The output neurons we watch. The number is how many times per second each neuron in the group fired, averaged over the last tenth of a second.",
  network:
    "Average firing rate across every neuron in the whole brain. A resting fly brain in this model is 0 Hz (it has no spontaneous activity); a few Hz means a specific circuit is active; tens of Hz means most of the brain is firing, which is a seizure, not a thought. Once a circuit ignites it never switches off by itself: this model has no adaptation or fatigue, so activity that a real fly would end in a second runs forever. Press reset to quiet it. flybench measures this failure as the task 'return_to_rest'.",
  gain:
    "A volume knob on every connection at once. Each synapse adds a fixed voltage kick to the receiving neuron; gain multiplies that kick. Too low and signals die out before reaching the output; too high and everything fires. flybench measured the window where the real reflexes work on this dataset (about 0.4–0.45). The 2024 Nature paper used 1.0 on an older version of the data.",
  speed:
    "The speed you are asking for, compared with your clock. 1× means one second of brain per second. What you actually get is on the status line, and it depends on how busy the brain is: a quiet real brain runs at 0.1–0.5× on a laptop, but once thousands of neurons are firing every step has to push all their spikes through the wiring, and it can drop to 0.01×. The toy runs faster than life. The seizing brain is the slow one.",
  pause: "Freeze or resume the simulation. State is kept, so resuming continues where it stopped.",
  reset: "Wipe all activity back to a resting brain and cancel any running stimulus. You will need this: a stimulated circuit in this model keeps firing indefinitely, because nothing in a wiring diagram plus five constants can switch it off. The connectome and settings are kept.",
  presetShiu: "Set gain to 1.0, the value from the 2024 Nature paper. On the current data this makes about a fifth of the brain fire at a taste of sugar.",
  copyLink: "Puts this experiment in the address bar and on your clipboard: the dataset, the gain, the input rate, and every sense or cell type you are holding on. Anyone who opens the link gets the same brain in the same state. Cite it like a figure.",
  presetFlybench: "Set gain to 0.45, the middle of the window where flybench's reflex tests pass on this dataset.",
  spin: "Slowly rotate the brain. Dragging it yourself also stops the rotation.",
  flyMode:
    "Put a fly on screen with this brain behind it. Your cursor is an object it can see: rush at the fly and its looming detectors fire at a rate set by how fast the cursor is expanding in its view; if the giant fiber then fires, it jumps. A click is a flash of light on every photoreceptor (a real fly does not escape from a flash — watch whether this one does). Drag the sugar drop to its head to feed it. The body is a puppet driven by the same readouts in this panel; the mapping from cursor to looming is ours, everything after the sensory neurons is the wiring. It sits still because FlyWire has no ventral cord, so there is no honest way to walk it. The brain is reset after every landing: in this model the giant fiber never stops once it starts, so without a reset the second lunge would find a brain that is already screaming.",
} as const;
