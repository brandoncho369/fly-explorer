import { describe, expect, it } from "vitest";
import { expansionRate, landing, loomRateHz, reactions } from "../flymode";

describe("cursor → looming", () => {
  it("is zero when far away, when still, and when moving away", () => {
    expect(expansionRate({ dist: 500, prevDist: 600, dtMs: 16, reach: 260 })).toBe(0);
    expect(expansionRate({ dist: 100, prevDist: 100, dtMs: 16, reach: 260 })).toBe(0);
    expect(expansionRate({ dist: 150, prevDist: 100, dtMs: 16, reach: 260 })).toBe(0);
    expect(expansionRate({ dist: 100, prevDist: 90, dtMs: 0, reach: 260 })).toBe(0);
  });
  it("grows with closing speed and with proximity (relative expansion, not raw speed)", () => {
    const slowFar = expansionRate({ dist: 240, prevDist: 244, dtMs: 16, reach: 260 });
    const fastFar = expansionRate({ dist: 200, prevDist: 240, dtMs: 16, reach: 260 });
    const fastNear = expansionRate({ dist: 40, prevDist: 80, dtMs: 16, reach: 260 });
    expect(fastFar).toBeGreaterThan(slowFar);
    expect(fastNear).toBeGreaterThan(fastFar);
  });
  it("maps expansion to a bounded, realistic detector rate", () => {
    expect(loomRateHz(0)).toBe(0);
    expect(loomRateHz(1.4)).toBe(0);                 // below threshold: a slow drift is not a loom
    expect(loomRateHz(2)).toBeGreaterThanOrEqual(30);
    expect(loomRateHz(1000)).toBe(200);              // capped
    expect(loomRateHz(5)).toBeGreaterThan(loomRateHz(3));
  });
});

describe("readouts → body", () => {
  it("jumps on a giant-fiber burst, with a cooldown", () => {
    expect(reactions({ "Giant Fiber": 300 }, 0, 1000).jump).toBe(true);
    expect(reactions({ "Giant Fiber": 300 }, 800, 1000).jump).toBe(false);   // jumped 200 ms ago
    expect(reactions({ "Giant Fiber": 2 }, 0, 1000).jump).toBe(false);
  });
  it("feeds on MN9 and flutters on descending activity", () => {
    expect(reactions({ "MN9 (proboscis)": 40 }, 0, 1e9)).toMatchObject({ feed: true, jump: false });
    expect(reactions({ "descending neurons": 3 }, 0, 1e9).flutter).toBe(true);
    expect(reactions({}, 0, 1e9)).toEqual({ jump: false, feed: false, flutter: false });
  });
  it("lands away from the threat and inside the arena", () => {
    for (let i = 0; i < 50; i++) {
      const to = landing({ x: 400, y: 250 }, { x: 300, y: 250 }, 800, 500);
      expect(to.x).toBeGreaterThan(400);                         // away from a threat on the left
      expect(to.x).toBeLessThanOrEqual(740); expect(to.y).toBeGreaterThanOrEqual(60); expect(to.y).toBeLessThanOrEqual(440);
    }
    const corner = landing({ x: 70, y: 70 }, { x: 400, y: 400 }, 800, 500);
    expect(corner.x).toBeGreaterThanOrEqual(60); expect(corner.y).toBeGreaterThanOrEqual(60);   // clamped, never off-screen
  });
});

import { newWalker, walkModulation, walkStep } from "../flymode";

describe("scripted walking (labelled as ours)", () => {
  const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
  it("runs straight, then turns, then runs again", () => {
    let s = newWalker(400, 250, seq([0.5]));
    const h0 = s.heading, x0 = s.x;
    s = walkStep(s, 0.1, 800, 500, { stop: false, speedMul: 1 }, seq([0.5]));
    expect(s.phase).toBe("run"); expect(s.heading).toBe(h0); expect(s.x).not.toBe(x0);
    for (let i = 0; i < 30; i++) s = walkStep(s, 0.1, 800, 500, { stop: false, speedMul: 1 }, seq([0.5]));
    // after enough time it has been through a turn and is running on a new heading
    expect(s.heading).not.toBe(h0);
    expect(["run", "turn"]).toContain(s.phase);
  });
  it("stands still while feeding, walks faster with descending activity", () => {
    const s = newWalker(400, 250, seq([0.5]));
    const still = walkStep(s, 0.5, 800, 500, walkModulation({ "MN9 (proboscis)": 40 }));
    expect(still.x).toBe(s.x); expect(still.y).toBe(s.y);
    const slow = walkStep(s, 0.5, 800, 500, walkModulation({}));
    const fast = walkStep(s, 0.5, 800, 500, walkModulation({ "descending neurons": 5 }));
    expect(Math.hypot(fast.x - s.x, fast.y - s.y)).toBeGreaterThan(Math.hypot(slow.x - s.x, slow.y - s.y));
  });
  it("never leaves the arena", () => {
    let s = { ...newWalker(20, 20), heading: Math.PI * 1.25 };   // pointed at the corner
    for (let i = 0; i < 600; i++) s = walkStep(s, 0.05, 800, 500, { stop: false, speedMul: 2 });
    expect(s.x).toBeGreaterThanOrEqual(10); expect(s.y).toBeGreaterThanOrEqual(10);
    expect(s.x).toBeLessThanOrEqual(790); expect(s.y).toBeLessThanOrEqual(490);
  });
});
