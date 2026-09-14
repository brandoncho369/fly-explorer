"use client";
import { useState } from "react";

// The number next to a slider: click it to type an exact value. Enter or blur commits (clamped to
// the slider's range, snapped to nothing — 0.437 stays 0.437), Escape cancels, junk is ignored.
export default function EditableValue({ label, value, min, max, step, onChange, fmt, className = "w-24" }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    setEditing(false);
  };
  if (editing) {
    return (
      <input type="number" min={min} max={max} step={step} value={text} autoFocus aria-label={`${label} value`}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className={`${className} text-right font-mono bg-zinc-900 border border-amber-400 rounded px-1 py-0 text-zinc-100 outline-none`} />
    );
  }
  return (
    <button type="button" title="click to type a value" aria-label={`edit ${label}`} onClick={() => { setText(String(value)); setEditing(true); }}
      className={`${className} text-right font-mono hover:text-amber-300 border-b border-dotted border-zinc-600 hover:border-amber-300`}>
      {fmt(value)}
    </button>
  );
}

