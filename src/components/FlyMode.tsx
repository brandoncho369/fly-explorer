"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { expansionRate, landing, loomRateHz } from "@/lib/flymode";

/**
 * A fly with the brain behind it. It sits still (FlyWire has no ventral cord, so there is no
 * honest way to walk it). The cursor is an object in its visual field: rush at it and the looming
 * detectors fire; if the giant fiber then fires, it takes off, flies an arc away from you and lands.
 * A click is a flash of light on every photoreceptor. Drag the sugar drop to its head to feed it.
 *
 * After every landing the brain is reset. That is not biology, it is a workaround for the model's
 * best-known failure: once the giant fiber fires it never stops (flybench: return_to_rest), so
 * without a reset the second lunge would find a brain that is already screaming and nothing new
 * would happen. The HUD says so.
 */
export interface FlyModeProps {
  rates: Record<string, number>;
  populations: string[];
  stim: (name: string, hz: number, ms: number) => void;
  stop: (name: string) => void;
  reset: () => void;
}

const LOOM = "looming (LPLC2/LC4)", PHOTO = "photoreceptors", SUGAR = "sugar GRNs";
const REACH = 280;          // px: the cursor is "in view" inside this radius
const HEAD = 30;            // px from body centre to the head
const FLIGHT_MS = 750;

type Flight = { from: { x: number; y: number }; to: { x: number; y: number }; t0: number } | null;

export function FlyMode({ rates, populations, stim, stop, reset }: FlyModeProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [fly, setFly] = useState({ x: 0.5, y: 0.5 });           // resting position, fractions of the arena
  const [heading, setHeading] = useState(0);
  const [flight, setFlight] = useState<Flight>(null);
  const [air, setAir] = useState({ x: 0, y: 0, lift: 0, heading: 0 });   // position while airborne
  const [sugar, setSugar] = useState({ x: 0.22, y: 0.72 });
  const [flash, setFlash] = useState(0);
  const [loomHz, setLoomHz] = useState(0);
  const [landings, setLandings] = useState(0);
  const last = useRef<{ x: number; y: number; t: number; dist: number } | null>(null);
  const prevGf = useRef(0);
  const lastTakeoff = useRef(0);
  const dragging = useRef(false);
  const feeding = useRef(false);
  const has = (p: string) => populations.includes(p);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const rest = { x: fly.x * size.w, y: fly.y * size.h };
  const px = flight ? { x: air.x, y: air.y } : rest;
  const sugarPx = { x: sugar.x * size.w, y: sugar.y * size.h };

  // ---- giant-fiber onset → takeoff (once per burst; the burst itself never ends in this model)
  const gf = rates["Giant Fiber"] ?? 0, mn9 = rates["MN9 (proboscis)"] ?? 0, dn = rates["descending neurons"] ?? 0;
  useEffect(() => {
    const onset = gf > 5 && prevGf.current <= 5;
    prevGf.current = gf;
    if (!onset || flight || performance.now() - lastTakeoff.current < 600) return;
    lastTakeoff.current = performance.now();
    const threat = last.current ?? { x: rest.x + 1, y: rest.y };
    const to = landing(rest, threat, size.w, size.h, 70, 260);
    const raf = requestAnimationFrame(() => setFlight({ from: rest, to, t0: performance.now() }));
    return () => cancelAnimationFrame(raf);
  }, [gf]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- flight: an arc away from the threat, then land, then reset the brain (see header comment)
  useEffect(() => {
    if (!flight) return;
    let raf = 0;
    const step = (now: number) => {
      const u = Math.min(1, (now - flight.t0) / FLIGHT_MS);
      const e = 1 - Math.pow(1 - u, 2);                                   // fast off the ground, slowing to land
      const x = flight.from.x + (flight.to.x - flight.from.x) * e, y = flight.from.y + (flight.to.y - flight.from.y) * e;
      setAir({ x, y, lift: Math.sin(u * Math.PI), heading: Math.atan2(flight.to.y - flight.from.y, flight.to.x - flight.from.x) });
      if (u < 1) raf = requestAnimationFrame(step);
      else {
        setFly({ x: flight.to.x / size.w, y: flight.to.y / size.h });
        setHeading(Math.atan2(flight.to.y - flight.from.y, flight.to.x - flight.from.x));
        setFlight(null); setLandings((n) => n + 1);
        feeding.current = false;
        last.current = null;
        reset();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flight]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- cursor → looming detectors; the fly also turns to face something close
  const onMove = useCallback((e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const x = e.clientX - r.left, y = e.clientY - r.top, t = performance.now();
    if (dragging.current) { setSugar({ x: x / r.width, y: y / r.height }); return; }
    if (flight) return;
    const dist = Math.hypot(x - rest.x, y - rest.y);
    const p = last.current;
    if (p) {
      const hz = loomRateHz(expansionRate({ dist, prevDist: p.dist, dtMs: t - p.t, reach: REACH }));
      setLoomHz(hz);
      if (hz > 0 && has(LOOM)) stim(LOOM, hz, 120);
    }
    if (dist < REACH) {
      const want = Math.atan2(y - rest.y, x - rest.x);
      setHeading((h) => h + Math.atan2(Math.sin(want - h), Math.cos(want - h)) * 0.25);   // eases round, no spin
    }
    last.current = { x, y, t, dist };
  }, [rest.x, rest.y, flight, stim, populations]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- click → flash of light on every photoreceptor (a real fly does not escape from a flash)
  const onClick = useCallback(() => {
    if (dragging.current) return;
    setFlash((f) => f + 1);
    if (has(PHOTO)) stim(PHOTO, 100, 200);
  }, [stim, populations]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- sugar drop at the head → sugar GRNs held on
  useEffect(() => {
    if (flight) return;
    const headX = rest.x + Math.cos(heading) * HEAD, headY = rest.y + Math.sin(heading) * HEAD;
    const touching = Math.hypot(sugarPx.x - headX, sugarPx.y - headY) < 38;
    if (touching && !feeding.current && has(SUGAR)) { feeding.current = true; stim(SUGAR, 100, Number.POSITIVE_INFINITY); }
    if (!touching && feeding.current) { feeding.current = false; stop(SUGAR); }
  }, [sugarPx.x, sugarPx.y, rest.x, rest.y, heading, flight]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (feeding.current) stop(SUGAR); }, [stop]);

  return (
    <div ref={box} className="absolute inset-0 select-none touch-none cursor-crosshair overflow-hidden" onPointerMove={onMove} onClick={onClick}
      onPointerUp={() => { dragging.current = false; }} onPointerLeave={() => { last.current = null; setLoomHz(0); }} data-testid="fly-arena">
      <div key={flash} className={`absolute inset-0 pointer-events-none ${flash ? "animate-[flash_300ms_ease-out]" : ""}`} style={{ background: "white", opacity: 0 }} />

      <div role="button" aria-label="sugar drop" onPointerDown={(e) => { e.stopPropagation(); dragging.current = true; }}
        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing" style={{ left: sugarPx.x, top: sugarPx.y }}>
        <div className="h-7 w-7 rounded-full bg-amber-200/90 shadow-[0_0_18px_rgba(252,211,77,0.5)] border border-amber-100" />
        <div className="text-[10px] text-amber-200/80 text-center mt-1 whitespace-nowrap">sugar · drag to its head</div>
      </div>

      {/* shadow on the ground while airborne */}
      {flight && <div className="absolute rounded-full bg-black/50 blur-md" style={{ left: px.x - 30, top: px.y - 12, width: 60, height: 24, opacity: 0.6 * (1 - air.lift * 0.5) }} />}

      <div className="absolute will-change-transform" style={{ left: 0, top: 0, transform: `translate(${px.x}px, ${px.y - (flight ? air.lift * 46 : 0)}px) translate(-50%, -50%)` }}>
        <FlyBody heading={flight ? air.heading : heading} airborne={!!flight} feeding={mn9 > 5 && !flight} alert={dn > 2 || gf > 5} />
      </div>

      <div className="absolute left-3 bottom-3 text-[11px] font-mono text-zinc-400 bg-black/50 rounded px-2 py-1.5 leading-relaxed pointer-events-none" data-testid="fly-hud">
        <div>looming detectors ← cursor: <span className={loomHz > 0 ? "text-amber-300" : ""}>{loomHz.toFixed(0)} Hz</span></div>
        <div>giant fiber: <span className={gf > 5 ? "text-cyan-300" : ""}>{gf.toFixed(0)} Hz</span> · MN9: <span className={mn9 > 5 ? "text-amber-200" : ""}>{mn9.toFixed(0)} Hz</span> · descending: {dn.toFixed(0)} Hz{landings > 0 ? ` · escapes: ${landings}` : ""}</div>
        <div className="text-zinc-600">rush the cursor at it · click = flash · drag sugar to its head</div>
        <div className="text-zinc-600">brain reset on every landing — this model cannot quiet itself (flybench: return_to_rest)</div>
      </div>

      <style>{`@keyframes flash { from { opacity: .55 } to { opacity: 0 } }
        @keyframes beat { from { transform: rotate(var(--a)) } to { transform: rotate(calc(var(--a) + var(--d))) } }`}</style>
    </div>
  );
}

/**
 * An original top-down Drosophila, facing +x. Small head with large red eyes, humped thorax,
 * striped abdomen, wings folded flat over the abdomen (overlapping) and beating when airborne,
 * six jointed legs. Proboscis extends when MN9 fires.
 */
function FlyBody({ heading, airborne, feeding, alert }: { heading: number; airborne: boolean; feeding: boolean; alert: boolean }) {
  const deg = (heading * 180) / Math.PI;
  const fold = airborne ? 62 : alert ? 12 : 7;           // wing angle off the body axis
  return (
    <svg width="150" height="150" viewBox="-75 -75 150 150" style={{ transform: `rotate(${deg}deg) scale(${airborne ? 1.35 : 1})`, transition: "transform 120ms" }} aria-label="fly">
      <defs>
        <radialGradient id="thx" cx="40%" cy="35%"><stop offset="0" stopColor="#8a7a5e" /><stop offset="1" stopColor="#3a3022" /></radialGradient>
        <radialGradient id="abd" cx="40%" cy="35%"><stop offset="0" stopColor="#7a6746" /><stop offset="1" stopColor="#241d12" /></radialGradient>
        <radialGradient id="eye" cx="35%" cy="35%"><stop offset="0" stopColor="#ff8f70" /><stop offset="0.7" stopColor="#b8261a" /><stop offset="1" stopColor="#5a0d08" /></radialGradient>
        <linearGradient id="wing" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(215,225,245,0.30)" /><stop offset="1" stopColor="rgba(215,225,245,0.08)" /></linearGradient>
      </defs>

      {/* legs: coxa at the thorax, femur out, tibia down; thin and jointed */}
      {[-1, 1].map((s) => (
        <g key={s} stroke="#2e2519" strokeWidth="1.7" strokeLinecap="round" fill="none">
          <path d={`M 10 ${s * 7} L 22 ${s * 14} L 34 ${s * 10} L 40 ${s * 22}`} />
          <path d={`M 2 ${s * 9} L 6 ${s * 22} L 16 ${s * 28} L 14 ${s * 40}`} />
          <path d={`M -8 ${s * 8} L -18 ${s * 20} L -30 ${s * 22} L -40 ${s * 36}`} />
        </g>
      ))}

      {/* abdomen: tapered, five dark bands */}
      <path d="M -6 -11 C -20 -13 -44 -8 -50 0 C -44 8 -20 13 -6 11 Z" fill="url(#abd)" />
      {[-14, -21, -28, -35, -42].map((x, i) => <path key={x} d={`M ${x} ${-(11 - i * 1.6)} Q ${x - 2} 0 ${x} ${11 - i * 1.6}`} stroke="#14100a" strokeWidth={2.2 - i * 0.2} fill="none" opacity=".85" />)}
      {/* thorax: humped */}
      <ellipse cx="4" cy="0" rx="14" ry="11.5" fill="url(#thx)" />
      <ellipse cx="6" cy="-3" rx="6" ry="3" fill="rgba(255,255,255,0.08)" />
      {/* head + eyes + antennae */}
      <circle cx="22" cy="0" r="7.5" fill="#5a4a34" />
      <ellipse cx="24" cy="-5.5" rx="4.6" ry="4" fill="url(#eye)" />
      <ellipse cx="24" cy="5.5" rx="4.6" ry="4" fill="url(#eye)" />
      <path d="M 27 -2 q 5 -3 7 -7" stroke="#2e2519" strokeWidth="1.3" fill="none" />
      <path d="M 27 2 q 5 3 7 7" stroke="#2e2519" strokeWidth="1.3" fill="none" />
      {/* proboscis */}
      <path d="M 28 0 l 5 0 q 3 0 3 3" stroke="#4a3b2a" strokeWidth="2.6" strokeLinecap="round" fill="none"
        style={{ transformOrigin: "28px 0px", transform: `scaleX(${feeding ? 2.4 : 0.55})`, transition: "transform 150ms" }} />

      {/* wings: hinged at the thorax, laid back over the abdomen, veined; beat fast when airborne */}
      {[-1, 1].map((s) => (
        <g key={s} style={{ transformOrigin: "-4px 0px", transform: `rotate(${s * fold}deg)`, transition: airborne ? "none" : "transform 140ms",
          animation: airborne ? `beat 60ms infinite alternate` : "none", ["--a" as string]: `${s * fold}deg`, ["--d" as string]: `${s * 22}deg` }}>
          <path d="M -4 0 C -12 -7 -34 -9 -50 -5 C -58 -3 -60 1 -54 3 C -40 8 -16 6 -4 0 Z" fill="url(#wing)" stroke="rgba(220,230,250,0.55)" strokeWidth="0.9" />
          <path d="M -6 -1 C -20 -4 -38 -6 -52 -4" stroke="rgba(220,230,250,0.35)" strokeWidth="0.7" fill="none" />
          <path d="M -6 1 C -20 2 -36 3 -50 1" stroke="rgba(220,230,250,0.3)" strokeWidth="0.7" fill="none" />
          <path d="M -18 -3 C -20 0 -20 1 -18 3" stroke="rgba(220,230,250,0.3)" strokeWidth="0.6" fill="none" />
        </g>
      ))}
    </svg>
  );
}
