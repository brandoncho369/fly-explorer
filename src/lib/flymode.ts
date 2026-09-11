/**
 * Fly mode: the part of the mapping that is OURS, not the fly's, kept pure and tested.
 *
 * A real looming detector (LPLC2/LC4) responds to an object expanding on the retina. We stand in
 * for the eye: the cursor is the object, its distance to the fly is the object's size on the
 * retina (closer = bigger), and the looming signal is the relative expansion rate, the same
 * tau-inverse quantity the biology literature uses. Everything downstream of the sensory
 * neurons is the wiring.
 */

export interface LoomInput { dist: number; prevDist: number; dtMs: number; reach: number }

/** Relative expansion rate (1/s) of an object at `dist`, ≥ 0. reach = distance beyond which the cursor is "far". */
export function expansionRate({ dist, prevDist, dtMs, reach }: LoomInput): number {
  if (dtMs <= 0) return 0;
  const d = Math.max(dist, 1), p = Math.max(prevDist, 1);
  if (d >= reach && p >= reach) return 0;             // outside the visual field
  const closing = (p - d) / (dtMs / 1000);            // px/s toward the fly
  return Math.max(0, closing / d);                    // relative rate: fast AND close is what looms
}

/** Firing rate (Hz) to drive the looming detectors with, from the expansion rate. Real LPLC2 rates: 0 to ~150 Hz. */
export function loomRateHz(expansion: number, threshold = 1.5, gainHz = 40, maxHz = 200): number {
  if (expansion < threshold) return 0;
  return Math.min(maxHz, (expansion - threshold) * gainHz + 30);
}

export interface Reactions { jump: boolean; feed: boolean; flutter: boolean }

/** Which body reaction the readouts call for. GF is one spike per escape in the fly; here any burst above 5 Hz counts. */
export function reactions(rates: Record<string, number>, lastJumpMs: number, nowMs: number, cooldownMs = 900): Reactions {
  const gf = rates["Giant Fiber"] ?? 0, mn9 = rates["MN9 (proboscis)"] ?? 0, dn = rates["descending neurons"] ?? 0;
  return { jump: gf > 5 && nowMs - lastJumpMs > cooldownMs, feed: mn9 > 5, flutter: dn > 2 };
}

/** Where the fly lands after a jump: away from the threat, inside the arena, at least `min` px from the edge. */
export function landing(fly: { x: number; y: number }, threat: { x: number; y: number }, w: number, h: number, min = 60, hop = 220): { x: number; y: number } {
  let dx = fly.x - threat.x, dy = fly.y - threat.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.8;   // roughly away, with the scatter real escapes have
  const x = Math.min(w - min, Math.max(min, fly.x + Math.cos(ang) * hop));
  const y = Math.min(h - min, Math.max(min, fly.y + Math.sin(ang) * hop));
  return { x, y };
}

/* ---------------- locomotion: OURS, and labelled as such in the UI ----------------
 * FlyWire is brain-only: the ventral nerve cord that actually paces the legs is not in it, so
 * where the fly walks cannot come from the wiring. We use a run-and-turn random walk with the
 * statistics reported for walking Drosophila (bouts of straight walking at ~10–20 mm/s, i.e.
 * a few body lengths per second, broken by sharp turns; Katsov & Clandinin 2008, Robie et al.
 * 2010). The brain modulates it: feeding stops walking, descending activity speeds it up, and
 * an escape (giant fiber) overrides everything.
 */
export interface Walker { x: number; y: number; heading: number; phase: "run" | "turn"; left: number; speed: number; turnRate: number }

export interface WalkMod { stop: boolean; speedMul: number }

export function newWalker(x: number, y: number, rng: () => number = Math.random): Walker {
  return { x, y, heading: rng() * Math.PI * 2, phase: "run", left: 0.4 + rng() * 1.6, speed: 40 + rng() * 50, turnRate: 0 };
}

/** Advance the walk by dt seconds inside a w×h arena (margin px from the edge). Pure given rng. */
export function walkStep(s: Walker, dt: number, w: number, h: number, mod: WalkMod, rng: () => number = Math.random, margin = 50): Walker {
  const n = { ...s };
  if (mod.stop) return n;                                      // proboscis out: the fly stands still
  n.left -= dt;
  if (n.phase === "run") {
    const v = n.speed * mod.speedMul;
    n.x += Math.cos(n.heading) * v * dt;
    n.y += Math.sin(n.heading) * v * dt;
    // near an edge: steer back toward the centre rather than walking into it
    if (n.x < margin || n.x > w - margin || n.y < margin || n.y > h - margin) {
      const toC = Math.atan2(h / 2 - n.y, w / 2 - n.x);
      let d = toC - n.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      n.heading += d * Math.min(1, 4 * dt);
      n.x = Math.min(w - 10, Math.max(10, n.x)); n.y = Math.min(h - 10, Math.max(10, n.y));
    }
    if (n.left <= 0) {
      n.phase = "turn";
      const ang = (0.5 + rng() * 1.6) * (rng() < 0.5 ? -1 : 1);   // 30°–120° either way
      n.left = 0.15 + rng() * 0.15;
      n.turnRate = ang / n.left;
    }
  } else {
    n.heading += n.turnRate * dt;
    if (n.left <= 0) { n.phase = "run"; n.left = 0.4 + rng() * 1.6; n.speed = 40 + rng() * 50; n.turnRate = 0; }
  }
  return n;
}

/** How the readouts modulate walking. */
export function walkModulation(rates: Record<string, number>): WalkMod {
  const mn9 = rates["MN9 (proboscis)"] ?? 0, dn = rates["descending neurons"] ?? 0;
  return { stop: mn9 > 5, speedMul: dn > 2 ? 1.6 : 1 };
}
