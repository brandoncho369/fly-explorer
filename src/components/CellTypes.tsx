"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { activityByType, externalLinks, neuronsOfType, searchTypes, type TypeActivity, type TypeTable } from "@/lib/celltypes";
import { Explain } from "@/components/Hint";
import snapshot from "@/data/leaderboard.json";
import synonyms from "@/data/synonyms.json";

/**
 * The lab tool: activate any annotated cell type by name, and see which cell types fired since the
 * last reset, ranked. This is the in-silico version of "express a driver in these neurons, activate
 * them, see what responds" — the experiment Shiu et al. 2024 showed the model can anticipate.
 */
export interface CellTypesProps {
  base: string;                                    // /data/<dataset>
  ready: boolean;
  gain: number;
  activeStims: string[];
  onFire: (name: string, neurons: Int32Array, hold: boolean) => void;
  held: Set<string>;
  requestReport: () => void;                        // ask the worker for spike counts
  report: { counts: Uint32Array; sinceMs: number } | null;
  onClear: () => void;
  initialTypes?: string[];                          // cell types a permalink asked to hold on; applied once the type table is loaded
  onMissing?: (names: string[]) => void;            // permalink names this dataset does not have
}

const HELP_SEARCH = "Every cell type in the dataset's annotation (8,773 on FlyWire v783), searchable by name: MN9, DNp01, LPLC2, KCg-m, aMe12… Literature names work too — 'giant fiber' finds DNp01 here and GF on MaleCNS, 'bIPS', 'P9', 'oviEN' resolve to the dataset's own name. Pick one and fire it to see what the wiring does with it. This is the in-silico version of activating a genetic driver line.";
const HELP_FIRED = "Which cell types have fired since the last reset, ranked by spikes per neuron across the whole type. 'active' is how many of the type's neurons fired at all. Types you are stimulating directly are marked as input. Read it as a prediction of what an activation experiment would show, with the trust line below telling you how far to believe it.";

export function CellTypes({ base, ready, gain, activeStims, onFire, held, requestReport, report, onClear, initialTypes, onMissing }: CellTypesProps) {
  const [loaded, setLoaded] = useState<{ base: string; table: TypeTable; ids: Uint16Array } | null>(null);
  const table = loaded?.base === base ? loaded.table : null;
  const ids = loaded?.base === base ? loaded.ids : null;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetch(`${base}/types.json`).then((r) => (r.ok ? r.json() : null)), fetch(`${base}/types.bin`).then((r) => (r.ok ? r.arrayBuffer() : null))])
      .then(([j, b]) => { if (alive && j && b) setLoaded({ base, table: j, ids: new Uint16Array(b) }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [base]);

  // poll the worker for spike counts once a second while the table is visible and something has fired
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(requestReport, 1000);
    return () => clearInterval(id);
  }, [ready, requestReport]);

  const hits = useMemo(() => (table ? searchTypes(table, q, 8, synonyms) : []), [table, q]);
  // a permalink's held cell types: fired (held) once the table for this dataset is in; names it lacks are reported, not dropped
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !table || !ids || !initialTypes?.length || applied.current === base) return;
    applied.current = base;
    const missing: string[] = [];
    for (const name of initialTypes) {
      const id = table.names.findIndex((n) => n.toLowerCase() === name.toLowerCase());
      if (id > 0) onFire(table.names[id], neuronsOfType(ids, id), true); else missing.push(name);
    }
    if (missing.length) onMissing?.(missing);
  }, [ready, table, ids, initialTypes, base, onFire, onMissing]);
  const rows: TypeActivity[] = useMemo(() => (report && ids && table ? activityByType(report.counts, ids, table, report.sinceMs).slice(0, 12) : []), [report, ids, table]);
  const pickedName = picked != null && table && picked < table.names.length ? table.names[picked] : null;
  const pickedCount = picked != null && table ? table.counts[picked] : 0;
  const fire = (hold: boolean) => { if (picked == null || !ids || !pickedName) return; onFire(pickedName, neuronsOfType(ids, picked), hold); setOpen(false); };
  const trust = trustLine(gain, base);

  return (
    <section className="space-y-2" data-testid="celltypes">
      <Explain title="activate any cell type" text={HELP_SEARCH}>
        <label className="text-xs uppercase tracking-wide text-zinc-500 block">activate any cell type <span className="normal-case tracking-normal text-zinc-600">· {table ? `${(table.names.length - 1).toLocaleString()} types` : "…"}</span></label>
      </Explain>
      <div className="relative" ref={boxRef}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setPicked(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={table ? "type a cell type: MN9, DNp01, LPLC2, KCg…" : "loading cell types…"}
          disabled={!table}
          aria-label="cell type search"
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-amber-300 outline-none disabled:opacity-40"
        />
        {open && hits.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded border border-zinc-700 bg-zinc-900 shadow-xl" role="listbox">
            {hits.map((h) => (
              <li key={h.id} role="option" aria-selected={picked === h.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setPicked(h.id); setQ(h.name); setOpen(false); }}
                  className="w-full flex items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-zinc-800">
                  <span className="truncate">{h.name}{h.via && <span className="text-zinc-500"> · a.k.a. {h.via}</span>}</span>
                  <span className="text-xs text-zinc-500 shrink-0">{h.count.toLocaleString()} · {h.superClass}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {pickedName && (
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => fire(false)} disabled={!ready} className="flex-1 px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-900 hover:border-zinc-400 disabled:opacity-40 text-left">
            fire <b>{pickedName}</b> <span className="text-zinc-500 text-xs">· {pickedCount.toLocaleString()} neurons · 500 ms</span>
          </button>
          <button onClick={() => fire(true)} disabled={!ready} aria-label={`hold ${pickedName}`} aria-pressed={held.has(pickedName)}
            className={`w-9 shrink-0 rounded border bg-zinc-900 hover:border-zinc-400 py-1.5 ${held.has(pickedName) ? "border-amber-300 text-amber-300 bg-amber-300/20" : "border-zinc-700 text-zinc-400"}`}>{held.has(pickedName) ? "■" : "⏺"}</button>
        </div>
      )}
      {pickedName && externalLinks(base.split("/").pop() ?? "", pickedName).length > 0 && (
        <p className="text-xs text-zinc-500" data-testid="external-links">look it up: {externalLinks(base.split("/").pop() ?? "", pickedName).map((l, i) => (
          <span key={l.label}>{i > 0 && " · "}<a href={l.href} target="_blank" rel="noreferrer" className="underline hover:text-zinc-300">{l.label}</a></span>
        ))}</p>
      )}

      <Explain title="what fired" text={HELP_FIRED}>
        <div className="flex items-baseline justify-between pt-1">
          <label className="text-xs uppercase tracking-wide text-zinc-500">what fired <span className="normal-case tracking-normal text-zinc-600">· by cell type{report ? `, last ${(report.sinceMs / 1000).toFixed(1)} s` : ""}</span></label>
          <button onClick={onClear} disabled={!ready} className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-40">clear</button>
        </div>
      </Explain>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-600">nothing yet — fire a sense or a cell type</p>
      ) : (
        <table className="w-full text-xs" data-testid="fired-table">
          <thead className="text-zinc-500"><tr><th className="text-left font-normal">cell type</th><th className="text-right font-normal">active</th><th className="text-right font-normal">Hz/neuron</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const input = activeStims.includes(r.name);
              return (
                <tr key={r.id} className="border-t border-zinc-800/60">
                  <td className="py-0.5 pr-2 truncate max-w-[9rem]" title={`${r.name} · ${r.superClass} · ${r.n} neurons`}>{r.name}{input && <span className="text-amber-300/80"> · input</span>}</td>
                  <td className="py-0.5 text-right tabular-nums text-zinc-400">{r.active}/{r.n}</td>
                  <td className="py-0.5 text-right tabular-nums font-mono">{r.hz.toFixed(r.hz < 10 ? 1 : 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-xs text-zinc-500 leading-relaxed" data-testid="trust">{trust}</p>
    </section>
  );
}

/** How far to trust a prediction at this gain: the benchmark's verdict for the nearest scored run on this dataset. */
function trustLine(gain: number, base: string): React.ReactNode {
  const ds = base.split("/").pop() ?? "";
  if (ds === "toy") return "Toy network: hand-wired, proves nothing about biology.";
  const runs = (snapshot as { runs: { connectome: string; gain: number; simulator: string; core: number | null; hard: number | null; seeds?: number }[] }).runs
    .filter((r) => r.connectome === ds && r.simulator === "LIFSimulator");
  if (!runs.length) return "No benchmark result for this dataset yet.";
  const near = runs.reduce((a, b) => (Math.abs(b.gain - gain) < Math.abs(a.gain - gain) ? b : a));
  const core = near.core == null ? "–" : `${Math.round(near.core * 5)}/5 core`;
  const hard = near.hard == null ? "–" : `${Math.round((near.hard ?? 0) * 100)}% of hard`;
  const same = Math.abs(near.gain - gain) < 1e-6;
  return (
    <>
      Trust: at gain {near.gain}{same ? "" : ` (nearest scored to ${gain.toFixed(2)})`} this model passes {core}, {hard} on <Link href="/bench" className="underline hover:text-zinc-300">flybench</Link>. Reflexes it reproduces are believable; rates, timing and anything that should switch off are not.
    </>
  );
}
