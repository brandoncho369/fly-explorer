import { describe, expect, it } from "vitest";
import snapshot from "../../data/leaderboard.json";
import { PRIMARY_CONNECTOME, byConnectome, gainWindow, otherConnectomes, rankRuns, tierScore, validateSnapshot, verdict, type Run, type Snapshot } from "../bench";

const snap = snapshot as unknown as Snapshot;

const mk = (over: Partial<Run>): Run => ({
  label: "x", connectome: "c", simulator: "LIF", gain: 1, w_syn: 0.275, core: 1, hard: 0.5, max_active: 0.1, tasks: {}, ...over,
});

describe("committed snapshot", () => {
  it("is internally consistent", () => {
    expect(validateSnapshot(snap)).toEqual([]);
  });
  it("has 5 core + 26 hard tasks; every run's tasks are known tasks and every run covers the core tier", () => {
    expect(snap.tasks.filter((t) => t.tier === "core")).toHaveLength(5);
    expect(snap.tasks.filter((t) => t.tier === "hard")).toHaveLength(31);
    const known = new Set(snap.tasks.map((t) => t.name));
    for (const r of snap.runs) {
      for (const name of Object.keys(r.tasks)) expect(known.has(name), `${r.label} has unknown task ${name}`).toBe(true);
      for (const t of snap.tasks.filter((t) => t.tier === "core")) expect(r.tasks[t.name], `${r.label} missing core task ${t.name}`).toBeDefined();
    }
  });
  it("records why a run could not score a task: a dataset_only task is 'not applicable' on the other brain, never 'not run yet'", () => {
    const fw = snap.runs.find((r) => r.label === "LIF gain 0.45 (3 seeds)")!;
    const mc = snap.runs.find((r) => r.connectome === "malecns" && r.gain === 0.65)!;
    expect(fw.skipped?.courtship_song_chain).toMatch(/^not applicable/);
    expect(fw.tasks.courtship_song_chain).toBeUndefined();
    expect(mc.tasks.courtship_song_chain).toBeDefined();
    expect(mc.skipped?.courtship_song_chain).toBeUndefined();
    expect(fw.skipped?.leg_mn_size_principle).toMatch(/^not applicable/);
    expect(mc.tasks.leg_mn_size_principle).toBeDefined();
  });
  it("reproduces the headline finding: robust window is 0.45 (0.40 fails with 3 seeds), Shiu 1.0 fails core", () => {
    const fw = byConnectome(snap.runs, PRIMARY_CONNECTOME);
    expect(gainWindow(fw)).toEqual({ lo: 0.45, hi: 0.45 });
    const g04 = fw.filter((r) => r.gain === 0.4);
    expect(g04.some((r) => (r.seeds ?? 1) >= 3 && (r.core ?? 1) < 1)).toBe(true);
    const shiu = fw.find((r) => r.gain === 1)!;
    expect(shiu.core).toBeLessThan(1);
    expect(shiu.max_active).toBeGreaterThan(0.15);
  });
  it("ranks a robust 0.45 run at the top", () => {
    const top = rankRuns(byConnectome(snap.runs, PRIMARY_CONNECTOME))[0];
    expect(top.gain).toBe(0.45);
  });
  it("other connectomes never leak into the primary sweep", () => {
    const fake = mk({ label: "male", connectome: "malecns", gain: 0.45, core: 0.5, seeds: 5 });
    const fw = byConnectome([...snap.runs, fake], PRIMARY_CONNECTOME);
    expect(fw.some((r) => r.connectome === "malecns")).toBe(false);
    expect(gainWindow(fw)).toEqual({ lo: 0.45, hi: 0.45 });
    expect(otherConnectomes([...snap.runs, fake])).toEqual(["malecns"]);
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
  it("rankRuns: core first, then hard, verified before self-reported, then lower gain; nulls last", () => {
    const rs = [mk({ label: "a", core: 0.8, hard: 0.9 }), mk({ label: "b", core: 1, hard: 0.5, gain: 0.5 }), mk({ label: "c", core: 1, hard: 0.5, gain: 0.4 }), mk({ label: "d", core: null, hard: null }),
      mk({ label: "e", core: 1, hard: 0.5, gain: 0.9, verified: true }), mk({ label: "f", core: 1, hard: 0.5, gain: 0.95, seeds: 3 })];
    expect(rankRuns(rs).map((r) => r.label)).toEqual(["f", "e", "c", "b", "a", "d"]);
  });
  it("gainWindow uses the best-evidenced run per gain", () => {
    const rs = [mk({ gain: 0.4, core: 1, seeds: 1 }), mk({ gain: 0.4, core: 0.8, seeds: 3 }), mk({ gain: 0.45, core: 1, seeds: 3 })];
    expect(gainWindow(rs)).toEqual({ lo: 0.45, hi: 0.45 });
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
    const weak = { passed: false, score: 0.33, checks: [{ d: "", v: 4.5, ok: false }, { d: "", v: 4500, ok: false }, { d: "", v: 0.004, ok: true }] };
    expect(verdict(mk({ core: 0.5, tasks: { sugar_to_proboscis: weak } }))).toBe("taste barely reaches the proboscis");
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
