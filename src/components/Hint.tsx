"use client";
import { useEffect, useId, useRef, useState } from "react";

/** A small "?" button that opens a plain-language explanation. Click or Escape to close. */
export default function Hint({ text, title }: { text: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={title ? `What is ${title}?` : "What is this?"}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] leading-none ${open ? "border-amber-300 text-amber-300" : "border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"}`}
      >
        ?
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-0 top-5 z-20 w-64 rounded border border-zinc-700 bg-zinc-900 p-2 text-xs font-normal normal-case tracking-normal text-zinc-300 shadow-lg leading-relaxed">
          {title && <b className="block text-zinc-100 mb-0.5">{title}</b>}
          {text}
        </span>
      )}
    </span>
  );
}

/** Plain-English explanations for every control. Keep these honest and short. */
export const HELP = {
  connectome:
    "The wiring diagram being simulated. 'toy' is a 2,000-neuron fake network we hand-wired so the app works instantly. 'FlyWire v783' is the real map of an adult fruit fly brain: 139,255 neurons and 3.7 million connections, traced from electron-microscope images by the FlyWire project.",
  stimulate:
    "Each button fakes a sense. Pressing it makes that group of sensory neurons fire randomly for half a second, the way they would if the fly tasted sugar, saw a shadow rush at it, and so on. Nothing else is scripted: what happens next is decided only by the wiring.",
  highlight:
    "Paint this group of neurons blue in the 3D view so you can see where they sit before you stimulate them. Click again to un-paint.",
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
  pause: "Freeze or resume the simulation. The state is kept, so unpausing continues where it stopped.",
  reset: "Wipe all activity back to a resting brain and cancel any running stimulus. The connectome and settings are kept.",
  presetShiu: "Set gain to 1.0, the value from Shiu et al. 2024. On the current v783 data this makes about a fifth of the brain fire on a taste of sugar.",
  presetFlybench: "Set gain to 0.45, the middle of the window where flybench's reflex tests pass on this dataset.",
  legend: "Colours are the neuron's broad class from the FlyWire annotations. Yellow means it fired in the last few milliseconds; brighter and bigger means more recently.",
  status: "Simulated time elapsed, how long one 0.1 ms step takes to compute on your machine, and the fixed model constants: time step, membrane and synapse time constants, spike threshold, and voltage per synapse.",
} as const;
