"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { expansionRate, landing, loomRateHz, reactions } from "@/lib/flymode";

/**
 * A fly with the brain behind it. The cursor is a looming object (rush at the fly and its looming
 * detectors fire), a click is a flash of light (photoreceptors), and a sugar drop you drag to its
 * head is sugar. What the fly then does — jump, extend its proboscis, twitch — is read straight
 * off the same readouts the sidebar shows. The body is a puppet; the brain is the real one.
 */
export interface FlyModeProps {
  rates: Record<string, number>;
  populations: string[];                                     // which named sets this dataset has
  stim: (name: string, hz: number, ms: number) => void;
  stop: (name: string) => void;
}

const LOOM = "looming (LPLC2/LC4)", PHOTO = "photoreceptors", SUGAR = "sugar GRNs";
const REACH = 260;      // px: the cursor is "in view" inside this radius

export function FlyMode({ rates, populations, stim, stop }: FlyModeProps) {
  const box = useRef<HTMLDivElement>(null);
  const [fly, setFly] = useState({ x: 0.5, y: 0.5 });          // fractions of the arena
  const [sugar, setSugar] = useState({ x: 0.2, y: 0.75 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [flash, setFlash] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [loomHz, setLoomHz] = useState(0);
  const [heading, setHeading] = useState(0);
  const last = useRef<{ x: number; y: number; t: number; dist: number } | null>(null);
  const lastJump = useRef(0);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const feeding = useRef(false);
  const has = (p: string) => populations.includes(p);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const px = { x: fly.x * size.w, y: fly.y * size.h };
  const sugarPx = { x: sugar.x * size.w, y: sugar.y * size.h };

  // cursor → looming detectors
  const onMove = useCallback((e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
    if (dragging.current) { setSugar({ x: x / r.width, y: y / r.height }); return; }
    const dist = Math.hypot(x - px.x, y - px.y);
    const prev = last.current;
    if (prev) {
      const ex = expansionRate({ dist, prevDist: prev.dist, dtMs: t - prev.t, reach: REACH });
      const hz = loomRateHz(ex);
      setLoomHz(hz);
      if (hz > 0 && has(LOOM)) stim(LOOM, hz, 120);   // short pulse, re-issued while the approach continues
      // the fly faces the thing that is close
      if (dist < REACH) setHeading(Math.atan2(y - px.y, x - px.x));
    }
    last.current = { x, y, t, dist };
  }, [px.x, px.y, stim, populations]);   // eslint-disable-line react-hooks/exhaustive-deps

  // click → flash of light on every photoreceptor (a real fly does not escape from a flash; watch whether this one does)
  const onClick = useCallback(() => {
    if (dragging.current) return;
    setFlash((f) => f + 1);
    if (has(PHOTO)) stim(PHOTO, 100, 200);
  }, [stim, populations]);   // eslint-disable-line react-hooks/exhaustive-deps

  // sugar drop touching the head → sugar GRNs held on
  useEffect(() => {
    const headX = px.x + Math.cos(heading) * 26, headY = px.y + Math.sin(heading) * 26;
    const touching = Math.hypot(sugarPx.x - headX, sugarPx.y - headY) < 34;
    if (touching && !feeding.current && has(SUGAR)) { feeding.current = true; stim(SUGAR, 100, Number.POSITIVE_INFINITY); }
    if (!touching && feeding.current) { feeding.current = false; stop(SUGAR); }
  }, [sugarPx.x, sugarPx.y, px.x, px.y, heading, stim, stop, populations]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (feeding.current) stop(SUGAR); }, [stop]);

  // readouts → body. The jump is decided in an effect (it needs the clock and the last cursor position); the rest is pure.
  const gf = rates["Giant Fiber"] ?? 0, mn9 = rates["MN9 (proboscis)"] ?? 0;
  const flutter = reactions(rates, 0, 1e9).flutter;
  useEffect(() => {
    const now = performance.now();
    if (!reactions(rates, lastJump.current, now).jump) return;
    lastJump.current = now;
    const threat = last.current ?? { x: px.x + 1, y: px.y };
    const to = landing(px, threat, size.w, size.h);
    requestAnimationFrame(() => { setJumping(true); setFly({ x: to.x / size.w, y: to.y / size.h }); });
    if (landTimer.current) clearTimeout(landTimer.current);
    landTimer.current = setTimeout(() => setJumping(false), 450);
  }, [rates]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (landTimer.current) clearTimeout(landTimer.current); }, []);

  return (
    <div ref={box} className="absolute inset-0 select-none touch-none cursor-crosshair" onPointerMove={onMove} onClick={onClick}
      onPointerUp={() => { dragging.current = false; }} onPointerLeave={() => { last.current = null; setLoomHz(0); }} data-testid="fly-arena">
      {/* flash */}
      <div key={flash} className={`absolute inset-0 pointer-events-none ${flash ? "animate-[flash_300ms_ease-out]" : ""}`} style={{ background: "white", opacity: 0 }} />

      {/* sugar drop */}
      <div role="button" aria-label="sugar drop" onPointerDown={(e) => { e.stopPropagation(); dragging.current = true; }}
        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
        style={{ left: sugarPx.x, top: sugarPx.y }}>
        <div className="h-7 w-7 rounded-full bg-amber-200/90 shadow-[0_0_18px_rgba(252,211,77,0.5)] border border-amber-100" />
        <div className="text-[10px] text-amber-200/80 text-center mt-1 whitespace-nowrap">sugar · drag to its head</div>
      </div>

      {/* the fly */}
      <div className="absolute" style={{ left: px.x, top: px.y, transform: "translate(-50%,-50%)", transition: jumping ? "left 380ms cubic-bezier(.2,.9,.3,1.2), top 380ms cubic-bezier(.2,.9,.3,1.2)" : "none" }}>
        <FlyBody heading={heading} jumping={jumping} feeding={mn9 > 5} flutter={flutter} startled={gf > 5} />
      </div>

      {/* what's being driven right now */}
      <div className="absolute left-3 bottom-3 text-[11px] font-mono text-zinc-400 bg-black/50 rounded px-2 py-1.5 leading-relaxed pointer-events-none" data-testid="fly-hud">
        <div>looming detectors ← cursor: <span className={loomHz > 0 ? "text-amber-300" : ""}>{loomHz.toFixed(0)} Hz</span></div>
        <div>giant fiber: <span className={gf > 5 ? "text-cyan-300" : ""}>{gf.toFixed(0)} Hz</span> · MN9: <span className={mn9 > 5 ? "text-amber-200" : ""}>{mn9.toFixed(0)} Hz</span></div>
        <div className="text-zinc-600">rush the cursor at it · click = flash · drag sugar to its head</div>
      </div>

      <style>{`@keyframes flash { from { opacity: .55 } to { opacity: 0 } }`}</style>
    </div>
  );
}

/** An original top-down fly, animated from the readouts. Wings spread on escape, proboscis extends on MN9, wings flutter on descending activity. */
function FlyBody({ heading, jumping, feeding, flutter, startled }: { heading: number; jumping: boolean; feeding: boolean; flutter: boolean; startled: boolean }) {
  const deg = (heading * 180) / Math.PI;
  const wing = jumping || startled ? 55 : flutter ? 22 : 12;
  return (
    <svg width="120" height="120" viewBox="-60 -60 120 120" style={{ transform: `rotate(${deg}deg) scale(${jumping ? 1.25 : 1})`, transition: "transform 200ms" }} aria-label="fly">
      <defs>
        <radialGradient id="body" cx="40%" cy="35%"><stop offset="0" stopColor="#7a6a52" /><stop offset="1" stopColor="#2a2418" /></radialGradient>
        <radialGradient id="eye" cx="35%" cy="35%"><stop offset="0" stopColor="#ff9a7a" /><stop offset="1" stopColor="#8a1a10" /></radialGradient>
      </defs>
      {/* legs */}
      {[-1, 1].map((s) => (
        <g key={s} stroke="#3a3126" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d={`M 8 ${s * 8} q 14 ${s * 6} 22 ${s * 22}`} />
          <path d={`M 0 ${s * 9} q 6 ${s * 16} -2 ${s * 28}`} />
          <path d={`M -9 ${s * 8} q -14 ${s * 8} -20 ${s * 24}`} />
        </g>
      ))}
      {/* wings */}
      {[-1, 1].map((s) => (
        <ellipse key={s} cx={-14} cy={s * 12} rx="30" ry="9" fill="rgba(200,220,255,0.18)" stroke="rgba(200,220,255,0.45)" strokeWidth="1"
          style={{ transformOrigin: "-4px 0px", transform: `rotate(${s * (180 - wing)}deg)`, transition: "transform 120ms", animation: flutter && !jumping ? `flut${s > 0 ? "R" : "L"} 90ms infinite alternate` : "none" }} />
      ))}
      {/* abdomen, thorax, head */}
      <ellipse cx="-18" cy="0" rx="20" ry="11" fill="url(#body)" />
      {[-12, -18, -24, -30].map((x) => <line key={x} x1={x} y1="-9" x2={x} y2="9" stroke="#1a150e" strokeWidth="1.5" opacity=".7" />)}
      <ellipse cx="2" cy="0" rx="13" ry="11" fill="url(#body)" />
      <circle cx="20" cy="0" r="8" fill="#4a3d2c" />
      <circle cx="23" cy="-5" r="4.2" fill="url(#eye)" />
      <circle cx="23" cy="5" r="4.2" fill="url(#eye)" />
      {/* antennae */}
      <path d="M 24 -2 q 6 -4 9 -8" stroke="#3a3126" strokeWidth="1.5" fill="none" />
      <path d="M 24 2 q 6 4 9 8" stroke="#3a3126" strokeWidth="1.5" fill="none" />
      {/* proboscis: extends when MN9 fires */}
      <path d="M 26 0 l 6 0 q 3 0 3 3" stroke="#5a4a36" strokeWidth="3" strokeLinecap="round" fill="none"
        style={{ transformOrigin: "26px 0px", transform: `scaleX(${feeding ? 2.2 : 0.6})`, transition: "transform 150ms" }} />
      <style>{`@keyframes flutR { from { transform: rotate(${180 - wing}deg) } to { transform: rotate(${180 - wing - 14}deg) } } @keyframes flutL { from { transform: rotate(${-(180 - wing)}deg) } to { transform: rotate(${-(180 - wing - 14)}deg) } }`}</style>
    </svg>
  );
}
