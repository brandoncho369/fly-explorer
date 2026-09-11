"use client";
import { useState } from "react";
import type { Run } from "@/lib/bench";

/**
 * Two small multiples over the same x (gain): core score, and peak brain activity.
 * One series each, so no legend; hover shows the exact value. Inline SVG, no library.
 */
export default function GainChart({ runs, window }: { runs: Run[]; window: { lo: number; hi: number } | null }) {
  const pts = [...runs].sort((a, b) => a.gain - b.gain);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Panel title="core reflexes passed" pts={pts} window={window} value={(r) => r.core ?? 0} fmt={(v) => v.toFixed(2)} yMax={1} yTicks={[0, 0.5, 1]} kind="line" />
      <Panel title="share of brain firing (peak)" pts={pts} window={window} value={(r) => r.max_active} fmt={(v) => `${Math.round(v * 100)}%`} yMax={0.4} yTicks={[0, 0.2, 0.4]} kind="bar" />
    </div>
  );
}

function Panel({ title, pts, window, value, fmt, yMax, yTicks, kind }: {
  title: string; pts: Run[]; window: { lo: number; hi: number } | null;
  value: (r: Run) => number; fmt: (v: number) => string; yMax: number; yTicks: number[]; kind: "line" | "bar";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 420, H = 190, L = 36, R = 12, T = 14, B = 30;
  const xs = pts.map((p) => p.gain);
  const xMin = Math.min(...xs) - 0.05, xMax = Math.max(...xs) + 0.05;
  const x = (g: number) => L + ((g - xMin) / (xMax - xMin)) * (W - L - R);
  const y = (v: number) => T + (1 - Math.min(v, yMax) / yMax) * (H - T - B);
  const bw = Math.max(8, ((W - L - R) / (xMax - xMin)) * 0.035);
  const h = hover != null ? pts[hover] : null;

  return (
    <figure className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <figcaption className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${title} versus gain`} onMouseLeave={() => setHover(null)}>
        {window && (
          <rect x={x(window.lo) - bw / 2 - 4} y={T} width={x(window.hi) - x(window.lo) + bw + 8} height={H - T - B} fill="#fbbf24" fillOpacity={0.08} rx={4} />
        )}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#27272a" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#71717a">{fmt(t)}</text>
          </g>
        ))}
        {pts.map((p, i) => (
          <text key={p.gain} x={x(p.gain)} y={H - B + 14} textAnchor="middle" fontSize={10} fill={i === hover ? "#e4e4e7" : "#71717a"}>{p.gain}</text>
        ))}
        <text x={W - R} y={H - 4} textAnchor="end" fontSize={10} fill="#52525b">gain →</text>
        {kind === "line" && (
          <polyline points={pts.map((p) => `${x(p.gain)},${y(value(p))}`).join(" ")} fill="none" stroke="#fbbf24" strokeWidth={2} strokeLinejoin="round" />
        )}
        {pts.map((p, i) => {
          const v = value(p), cx = x(p.gain), cy = y(v);
          return kind === "bar" ? (
            <rect key={p.gain} x={cx - bw / 2} y={cy} width={bw} height={Math.max(0, H - B - cy)} rx={3} fill="#fbbf24" fillOpacity={i === hover ? 1 : 0.75} />
          ) : (
            <circle key={p.gain} cx={cx} cy={cy} r={i === hover ? 6 : 4.5} fill="#fbbf24" stroke="#07080c" strokeWidth={2} />
          );
        })}
        {/* wide hit targets */}
        {pts.map((p, i) => (
          <rect key={`hit-${p.gain}`} x={x(p.gain) - 14} y={T} width={28} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`gain ${p.gain}: ${fmt(value(p))}`} />
        ))}
        {h && (
          <g transform={`translate(${Math.min(Math.max(x(h.gain), L + 60), W - R - 60)}, ${T + 2})`}>
            <rect x={-58} y={0} width={116} height={20} rx={4} fill="#18181b" stroke="#3f3f46" />
            <text x={0} y={14} textAnchor="middle" fontSize={11} fill="#e4e4e7">gain {h.gain} · {fmt(value(h))}</text>
          </g>
        )}
      </svg>
      {window && <p className="text-[11px] text-zinc-500 mt-1">shaded: gain {window.lo}–{window.hi}, every core reflex passes</p>}
    </figure>
  );
}
