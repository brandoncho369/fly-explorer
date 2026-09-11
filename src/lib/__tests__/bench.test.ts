import { describe, expect, it } from "vitest";
import snapshot from "../../data/leaderboard.json";
import { gainWindow, rankRuns, tierScore, validateSnapshot, verdict, type Run, type Snapshot } from "../bench";

const snap = snapshot as unknown as Snapshot;

const mk = (over: Partial<Run>): Run => ({
  label: "x", connectome: "c", simulator: "LIF", gain: 1, w_syn: 0.275, core: 1, hard: 0.5, max_active: 0.1, tasks: {}, ...over,
});

describe("committed snapshot", () => {
  it("is internally consistent", () => {
    expect(validateSnapshot(snap)).toEqual([]);
  });
  it("has 5 core + 6 hard tasks and every run covers all of them", () => {
    expect(snap.tasks.filter((t) => t.tier === "core")).toHaveLength(5);
    expect(snap.tasks.filter((t) => t.tier === "hard")).toHaveLength(6);
    for (const r of snap.runs) for (const t of snap.tasks) expect(r.tasks[t.name], `${r.label} missing ${t.name}`).toBeDefined();
  });
  it("reproduces the headline finding: window 0.40–0.45, Shiu 1.0 fails core", () => {
    expect(gainWindow(snap.runs)).toEqual({ lo: 0.4, hi: 0.45 });
    const shiu = snap.runs.find((r) => r.gain === 1)!;
    expect(shiu.core).toBeLessThan(1);
    expect(shiu.max_active).toBeGreaterThan(0.15);
  });
  it("ranks the window at the top", () => {
    const top = rankRuns(snap.runs)[0];
    expect(top.gain).toBe(0.4);
  });
});

describe("validateSnapshot catches corruption", () => {
  const good = snap;
  it("bad tier / missing citation / duplicate task", () => {
    const bad = structuredClone(good) as Snapshot;
    bad.tasks[0].tier = "medium"; bad.tasks[1].citation = ""; bad.tasks.push({ ...bad.tasks[2] });
    const errs = validateSnapshot(bad).join("\n");
    expect(errs).toMatch(/bad tier/); expect(errs).toMatch(/missing citation/); expect(errs).toMatch(/duplicate task/);
  });
  it("score/passed mismatch and out-of-range values", () => {
    const bad = structuredClone(good) as Snapshot;
    const r = bad.runs[0];
    r.tasks.stability.passed = false;                       // checks all ok but passed=false
    r.max_active = 2;
    bad.runs[1].core = 1.5;
    const errs = validateSnapshot(bad).join("\n");
    expect(errs).toMatch(/passed flag disagrees/); expect(errs).toMatch(/max_active/); expect(errs).toMatch(/core out of range/);
  });
  it("tier score must equal mean of task scores", () => {
    const bad = structuredClone(good) as Snapshot;
    bad.runs[0].hard = 0.99;
    expect(validateSnapshot(bad).join("\n")).toMatch(/hard score/);
  });
});

describe("helpers", () => {
  it("rankRuns: core first, then hard, then lower gain; nulls last", () => {
    const rs = [mk({ label: "a", core: 0.8, hard: 0.9 }), mk({ label: "b", core: 1, hard: 0.5, gain: 0.5 }), mk({ label: "c", core: 1, hard: 0.5, gain: 0.4 }), mk({ label: "d", core: null, hard: null })];
    expect(rankRuns(rs).map((r) => r.label)).toEqual(["c", "b", "a", "d"]);
  });
  it("gainWindow: null when nothing passes; single point; range", () => {
    expect(gainWindow([mk({ core: 0.5 })])).toBeNull();
    expect(gainWindow([mk({ core: 1, gain: 0.7 })])).toEqual({ lo: 0.7, hi: 0.7 });
    expect(gainWindow([mk({ core: 1, gain: 0.7 }), mk({ core: 0, gain: 0.3 }), mk({ core: 1, gain: 0.4 })])).toEqual({ lo: 0.4, hi: 0.7 });
  });
  it("verdict reads the failed tasks", () => {
    const pass = { passed: true, score: 1, checks: [{ d: "", v: 1, ok: true }] };
    const fail0 = { passed: false, score: 0, checks: [{ d: "", v: 0, ok: false }] };
    const failHi = { passed: false, score: 0.5, checks: [{ d: "", v: 400, ok: true }, { d: "", v: 0.3, ok: false }] };
    expect(verdict(mk({ core: 1 }))).toBe("passes every known reflex");
    expect(verdict(mk({ core: 0.5, tasks: { sugar_to_proboscis: fail0 } }))).toBe("taste never reaches the proboscis");
    expect(verdict(mk({ core: 0.5, tasks: { sugar_to_proboscis: failHi } }))).toBe("too much of the brain fires");
    expect(verdict(mk({ core: 0.5, tasks: { sugar_to_proboscis: pass, bitter_suppression: fail0 } }))).toBe("bitter can no longer cancel sugar");
    expect(verdict(mk({ core: 0.5, tasks: { stability: fail0 } }))).toBe("fires with no input at all");
  });
  it("tierScore is the mean over that tier's tasks", () => {
    const tasks = [{ name: "a", title: "", tier: "core", description: "", citation: "" }, { name: "b", title: "", tier: "hard", description: "", citation: "" }];
    const r = mk({ tasks: { a: { passed: false, score: 0.5, checks: [] }, b: { passed: true, score: 1, checks: [] } } });
    expect(tierScore(r, tasks, "core")).toBe(0.5);
    expect(tierScore(r, tasks, "hard")).toBe(1);
    expect(tierScore(r, tasks, "nope")).toBeNull();
  });
});
