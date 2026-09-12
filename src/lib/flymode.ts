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
