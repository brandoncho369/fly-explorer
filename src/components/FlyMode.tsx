"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { expansionRate, landing, loomRateHz, newWalker, walkModulation, walkStep, type Walker } from "@/lib/flymode";

/**
 * A fly with the brain behind it. The cursor is a looming object (rush at the fly and its looming
 * detectors fire), a click is a flash of light (photoreceptors), and a sugar drop you drag onto it
 * is sugar. What the fly then does — jump, extend its proboscis, stop, hurry — is read straight
 * off the same readouts the sidebar shows. Walking itself is a scripted random walk (FlyWire has
 * no ventral cord), and the HUD says so. The body is a puppet; the brain is the real one.
 */
export interface FlyModeProps {
  rates: Record<string, number>;
  populations: string[];
  stim: (name: string, hz: number, ms: number) => void;
  stop: (name: string) => void;
}

const LOOM = "looming (LPLC2/LC4)", PHOTO = "photoreceptors", SUGAR = "sugar GRNs";
const REACH = 260;       // px: the cursor is "in view" inside this radius
const HEAD = 26;         // px from body centre to the head

export function FlyMode({ rates, populations, stim, stop }: FlyModeProps) {
  const box = useRef<HTMLDivElement>(null);
  const walker = useRef<Walker | null>(null);
  const size = useRef({ w: 800, h: 500 });
  const rateRef = useRef(rates);
  useEffect(() => { rateRef.current = rates; }, [rates]);
  // what the puppet renders from: a snapshot of the walker, published at ~30 Hz
  const [pose, setPose] = useState({ x: 400, y: 250, heading: 0, phase: "run" as Walker["phase"], w: 800, h: 500, tick: 0 });
  const [sugar, setSugar] = useState({ x: 0.2, y: 0.75 });
  const [flash, setFlash] = useState(0);
  const [jumping, setJumping] = useState(false);
  const [loomHz, setLoomHz] = useState(0);
  const last = useRef<{ x: number; y: number; t: number; dist: number } | null>(null);
  const lastJump = useRef(0);
  const prevGf = useRef(0);
  const dragging = useRef(false);
  const feeding = useRef(false);
  const has = (p: string) => populations.includes(p);

  // ---- locomotion loop: scripted walk, modulated by the brain; jumps on a giant-fiber onset
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => { size.current = { w: el.clientWidth, h: el.clientHeight }; });
    ro.observe(el); size.current = { w: el.clientWidth, h: el.clientHeight };
    if (!walker.current) walker.current = newWalker(size.current.w / 2, size.current.h / 2);
    let raf = 0, prev = performance.now(), lastPaint = 0, landAt = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
      const r = rateRef.current, gf = r["Giant Fiber"] ?? 0;
      const w = walker.current!;
      // escape: on the onset of a GF burst (not every frame of one — this model never stops firing)
      if (gf > 5 && prevGf.current <= 5 && now - lastJump.current > 900) {
        lastJump.current = now; landAt = now + 420;
        const threat = last.current ?? { x: w.x + 1, y: w.y };
        const to = landing(w, threat, size.current.w, size.current.h);
        const want = Math.atan2(to.y - w.y, to.x - w.x);
        w.heading += Math.atan2(Math.sin(want - w.heading), Math.cos(want - w.heading));   // shortest turn, no 360° spin
        w.x = to.x; w.y = to.y; w.phase = "run"; w.left = 0.3;
        setJumping(true);
      }
      prevGf.current = gf;
      if (landAt && now > landAt) { landAt = 0; setJumping(false); }
      if (now - lastJump.current > 420) walker.current = walkStep(w, dt, size.current.w, size.current.h, walkModulation(r));
      if (now - lastPaint > 33) { lastPaint = now; const q = walker.current!; setPose((o) => ({ x: q.x, y: q.y, heading: q.heading, phase: q.phase, w: size.current.w, h: size.current.h, tick: o.tick + 1 })); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  const w = pose, tick = pose.tick;
  const px = { x: w.x, y: w.y };
  const sugarPx = { x: sugar.x * pose.w, y: sugar.y * pose.h };

  // ---- cursor → looming detectors
  const onMove = useCallback((e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
    if (dragging.current) { setSugar({ x: x / r.width, y: y / r.height }); return; }
    const f = walker.current; if (!f) return;
    const dist = Math.hypot(x - f.x, y - f.y);
    const p = last.current;
    if (p) {
      const hz = loomRateHz(expansionRate({ dist, prevDist: p.dist, dtMs: t - p.t, reach: REACH }));
      setLoomHz(hz);
      if (hz > 0 && has(LOOM)) stim(LOOM, hz, 120);   // short pulse, re-issued while the approach continues
    }
    last.current = { x, y, t, dist };
  }, [stim, populations]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- click → a flash of light on every photoreceptor (a real fly does not escape from a flash)
  const onClick = useCallback(() => {
    if (dragging.current) return;
    setFlash((f) => f + 1);
    if (has(PHOTO)) stim(PHOTO, 100, 200);
  }, [stim, populations]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sugar drop under the head → sugar GRNs held on
  useEffect(() => {
    const headX = px.x + Math.cos(w.heading) * HEAD, headY = px.y + Math.sin(w.heading) * HEAD;
    const touching = Math.hypot(sugarPx.x - headX, sugarPx.y - headY) < 36;
    if (touching && !feeding.current && has(SUGAR)) { feeding.current = true; stim(SUGAR, 100, Number.POSITIVE_INFINITY); }
    if (!touching && feeding.current) { feeding.current = false; stop(SUGAR); }
  }, [tick, sugarPx.x, sugarPx.y]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (feeding.current) stop(SUGAR); }, [stop]);

  const gf = rates["Giant Fiber"] ?? 0, mn9 = rates["MN9 (proboscis)"] ?? 0, dn = rates["descending neurons"] ?? 0;
  const walking = !jumping && !(mn9 > 5) && pose.phase === "run";

  return (
    <div ref={box} className="absolute inset-0 select-none touch-none cursor-crosshair overflow-hidden" onPointerMove={onMove} onClick={onClick}
      onPointerUp={() => { dragging.current = false; }} onPointerLeave={() => { last.current = null; setLoomHz(0); }} data-testid="fly-arena">
      <div key={flash} className={`absolute inset-0 pointer-events-none ${flash ? "animate-[flash_300ms_ease-out]" : ""}`} style={{ background: "white", opacity: 0 }} />

      <div role="button" aria-label="sugar drop" onPointerDown={(e) => { e.stopPropagation(); dragging.current = true; }}
        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing" style={{ left: sugarPx.x, top: sugarPx.y }}>
        <div className="h-7 w-7 rounded-full bg-amber-200/90 shadow-[0_0_18px_rgba(252,211,77,0.5)] border border-amber-100" />
        <div className="text-[10px] text-amber-200/80 text-center mt-1 whitespace-nowrap">sugar · drop it in its path</div>
      </div>

      <div className="absolute will-change-transform" style={{ left: 0, top: 0, transform: `translate(${px.x}px, ${px.y}px) translate(-50%, -50%)`, transition: jumping ? "transform 380ms cubic-bezier(.2,.9,.3,1.2)" : "none" }}>
        <FlyBody heading={w.heading} jumping={jumping} feeding={mn9 > 5} hurry={dn > 2} startled={gf > 5} walking={walking} tick={tick} />
      </div>

      <div className="absolute left-3 bottom-3 text-[11px] font-mono text-zinc-400 bg-black/50 rounded px-2 py-1.5 leading-relaxed pointer-events-none" data-testid="fly-hud">
        <div>looming detectors ← cursor: <span className={loomHz > 0 ? "text-amber-300" : ""}>{loomHz.toFixed(0)} Hz</span></div>
        <div>giant fiber: <span className={gf > 5 ? "text-cyan-300" : ""}>{gf.toFixed(0)} Hz</span> · MN9: <span className={mn9 > 5 ? "text-amber-200" : ""}>{mn9.toFixed(0)} Hz</span> · descending: {dn.toFixed(0)} Hz</div>
        <div className="text-zinc-600">brain: escape · feeding · pace &nbsp;|&nbsp; ours: walking (random walk, no ventral cord in FlyWire)</div>
        <div className="text-zinc-600">rush the cursor at it · click = flash · drop sugar in its path</div>
      </div>

      <style>{`@keyframes flash { from { opacity: .55 } to { opacity: 0 } }`}</style>
    </div>
  );
}

/** An original top-down fly. Faces +x. Wings lie back over the abdomen and open on escape; legs stride while walking; proboscis extends on MN9. */
function FlyBody({ heading, jumping, feeding, hurry, startled, walking, tick }: { heading: number; jumping: boolean; feeding: boolean; hurry: boolean; startled: boolean; walking: boolean; tick: number }) {
  const deg = (heading * 180) / Math.PI;
  const open = jumping || startled ? 50 : hurry ? 26 : 14;          // wing angle away from the body axis
  const stride = walking ? Math.sin(tick * (hurry ? 1.4 : 0.9)) * 5 : 0;   // legs alternate while walking
  return (
    <svg width="132" height="132" viewBox="-66 -66 132 132" style={{ transform: `rotate(${deg}deg) scale(${jumping ? 1.25 : 1})`, transition: "transform 200ms" }} aria-label="fly">
      <defs>
        <radialGradient id="body" cx="40%" cy="35%"><stop offset="0" stopColor="#7a6a52" /><stop offset="1" stopColor="#2a2418" /></radialGradient>
        <radialGradient id="eye" cx="35%" cy="35%"><stop offset="0" stopColor="#ff9a7a" /><stop offset="1" stopColor="#8a1a10" /></radialGradient>
      </defs>
      {/* wings: rooted at the thorax, trailing back over the abdomen (-x), opening outward on escape */}
      {[-1, 1].map((s) => (
        <ellipse key={s} cx={-24} cy={0} rx="30" ry="8.5" fill="rgba(200,220,255,0.16)" stroke="rgba(200,220,255,0.45)" strokeWidth="1"
          style={{ transformOrigin: "-2px 0px", transform: `rotate(${s * open}deg)`, transition: "transform 120ms" }} />
      ))}
      {/* legs: three per side, the middle pair striding opposite the front and hind pairs */}
      {[-1, 1].map((s) => (
        <g key={s} stroke="#3a3126" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d={`M 8 ${s * 8} q ${14 + stride * s} ${s * 6} ${22 + stride * s} ${s * 22}`} />
          <path d={`M 0 ${s * 9} q ${6 - stride * s} ${s * 16} ${-2 - stride * s} ${s * 28}`} />
          <path d={`M -9 ${s * 8} q ${-14 + stride * s} ${s * 8} ${-20 + stride * s} ${s * 24}`} />
        </g>
      ))}
      <ellipse cx="-18" cy="0" rx="20" ry="11" fill="url(#body)" />
      {[-12, -18, -24, -30].map((x) => <line key={x} x1={x} y1="-9" x2={x} y2="9" stroke="#1a150e" strokeWidth="1.5" opacity=".7" />)}
      <ellipse cx="2" cy="0" rx="13" ry="11" fill="url(#body)" />
      <circle cx="20" cy="0" r="8" fill="#4a3d2c" />
      <circle cx="23" cy="-5" r="4.2" fill="url(#eye)" />
      <circle cx="23" cy="5" r="4.2" fill="url(#eye)" />
      <path d="M 24 -2 q 6 -4 9 -8" stroke="#3a3126" strokeWidth="1.5" fill="none" />
      <path d="M 24 2 q 6 4 9 8" stroke="#3a3126" strokeWidth="1.5" fill="none" />
      <path d="M 26 0 l 6 0 q 3 0 3 3" stroke="#5a4a36" strokeWidth="3" strokeLinecap="round" fill="none"
        style={{ transformOrigin: "26px 0px", transform: `scaleX(${feeding ? 2.2 : 0.6})`, transition: "transform 150ms" }} />
    </svg>
  );
}
