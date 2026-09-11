/** Pure helpers for the /bench page — unit-tested, no React. */

export interface Check { d: string; v: number; ok: boolean }
export interface TaskResult { passed: boolean; score: number; checks: Check[] }
export interface Run {
  label: string; connectome: string; simulator: string; gain: number; w_syn: number;
  core: number | null; hard: number | null; max_active: number;
  tasks: Record<string, TaskResult>;
}
export interface Task { name: string; title: string; tier: "core" | "hard" | string; description: string; citation: string }
export interface Snapshot { generated: string; source: string; runs: Run[]; tasks: Task[] }

/** Leaderboard order: core score desc, then hard score desc, then lower gain first (tie-break, deterministic). */
export function rankRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => (b.core ?? -1) - (a.core ?? -1) || (b.hard ?? -1) - (a.hard ?? -1) || a.gain - b.gain);
}

/** The contiguous range of gains (sorted ascending) at which every core task passes. Null if none. */
export function gainWindow(runs: Run[]): { lo: number; hi: number } | null {
  const ok = runs.filter((r) => r.core === 1).map((r) => r.gain).sort((a, b) => a - b);
  if (!ok.length) return null;
  return { lo: ok[0], hi: ok[ok.length - 1] };
}

/** One-line plain-English reading of a run, derived from which core tasks failed rather than from the gain value. */
export function verdict(run: Run): string {
  if (run.core === 1) return "passes every known reflex";
  const t = run.tasks;
  const failed = (n: string) => t[n] && !t[n].passed;
  if (failed("stability")) return "fires with no input at all";
  if (failed("sugar_to_proboscis") && (t.sugar_to_proboscis?.checks[0]?.v ?? 0) === 0) return "taste never reaches the proboscis";
  if (failed("sugar_to_proboscis") || failed("looming_to_giant_fiber")) return "too much of the brain fires";
  if (failed("bitter_suppression")) return "bitter can no longer cancel sugar";
  if (failed("taste_specificity")) return "bitter alone extends the proboscis";
  return "fails a core reflex";
}

/** Recompute a tier score from task results the same way flybench does (mean of task scores). */
export function tierScore(run: Run, tasks: Task[], tier: string): number | null {
  const s = tasks.filter((t) => t.tier === tier).map((t) => run.tasks[t.name]?.score).filter((x): x is number => typeof x === "number");
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/** Validate a snapshot; returns a list of problems (empty = fine). Used by tests and at build time. */
export function validateSnapshot(snap: Snapshot): string[] {
  const errs: string[] = [];
  if (!snap.runs?.length) errs.push("no runs");
  if (!snap.tasks?.length) errs.push("no tasks");
  const names = new Set<string>();
  for (const t of snap.tasks ?? []) {
    if (names.has(t.name)) errs.push(`duplicate task ${t.name}`);
    names.add(t.name);
    if (!["core", "hard"].includes(t.tier)) errs.push(`${t.name}: bad tier ${t.tier}`);
    if (!t.citation) errs.push(`${t.name}: missing citation`);
    if (!t.description) errs.push(`${t.name}: missing description`);
  }
  const labels = new Set<string>();
  for (const r of snap.runs ?? []) {
    if (labels.has(r.label)) errs.push(`duplicate run label ${r.label}`);
    labels.add(r.label);
    if (!(r.gain > 0)) errs.push(`${r.label}: gain must be > 0`);
    for (const k of ["core", "hard"] as const) {
      const v = r[k];
      if (v != null && (v < 0 || v > 1)) errs.push(`${r.label}: ${k} out of range`);
      const recomputed = tierScore(r, snap.tasks, k);
      if (v != null && recomputed != null && Math.abs(v - recomputed) > 1e-6) errs.push(`${r.label}: ${k} score ${v} ≠ mean of task scores ${recomputed}`);
    }
    if (!(r.max_active >= 0 && r.max_active <= 1)) errs.push(`${r.label}: max_active out of range`);
    for (const [name, tr] of Object.entries(r.tasks)) {
      if (!names.has(name)) errs.push(`${r.label}: result for unknown task ${name}`);
      if (tr.score < 0 || tr.score > 1) errs.push(`${r.label}/${name}: score out of range`);
      const allOk = tr.checks.every((c) => c.ok);
      if (tr.passed !== (allOk && tr.checks.length > 0)) errs.push(`${r.label}/${name}: passed flag disagrees with checks`);
      const frac = tr.checks.length ? tr.checks.filter((c) => c.ok).length / tr.checks.length : 0;
      if (Math.abs(frac - tr.score) > 1e-6) errs.push(`${r.label}/${name}: score ≠ fraction of checks passed`);
    }
  }
  return errs;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const score2 = (v: number | null) => (v == null ? "–" : v.toFixed(2));
