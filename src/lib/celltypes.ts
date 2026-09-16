/** Cell-type tools for the explorer: search the real annotation, and summarise which types fired. Pure, unit-tested. */

export interface TypeTable { names: string[]; counts: number[]; super_class: string[] }

export interface TypeHit { id: number; name: string; count: number; superClass: string; via?: string }

/** native type name -> other names for the same cells (literature, community, the other dataset's name).
 *  The table is src/data/synonyms.json (ROADMAP item 55): keys are native type names as they appear in at least
 *  one dataset's annotation; search resolves an alias to whichever of them the loaded dataset has. */
export type Synonyms = Record<string, string[]>;

/**
 * Substring search over type names, exact/prefix matches first, then by population size. Id 0 (untyped)
 * is never returned. With a synonym table, a query that matches an alias ("giant fiber", "P9", "bIPS")
 * also returns the native types it names in this dataset, marked `via: <the alias>` — so GF finds DNp01
 * on FlyWire and DNp01 finds GF on MaleCNS, and only names this dataset actually has come back.
 */
export function searchTypes(t: TypeTable, query: string, limit = 8, synonyms?: Synonyms): TypeHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: (TypeHit & { rank: number })[] = [];
  const seen = new Set<number>();
  for (let id = 1; id < t.names.length; id++) {
    const name = t.names[id], lc = name.toLowerCase();
    const at = lc.indexOf(q);
    if (at < 0) continue;
    const rank = lc === q ? 0 : at === 0 ? 1 : 2;
    hits.push({ id, name, count: t.counts[id], superClass: t.super_class[id], rank });
    seen.add(id);
  }
  if (synonyms) {
    const byName = new Map<string, number>();
    for (let id = 1; id < t.names.length; id++) byName.set(t.names[id].toLowerCase(), id);
    for (const [native, aliases] of Object.entries(synonyms)) {
      if (!Array.isArray(aliases)) continue;
      // the alias that matched: one of the listed names, or the native name itself when it is absent here
      const matched = aliases.find((a) => a.toLowerCase().includes(q)) ?? (native.toLowerCase().includes(q) ? native : undefined);
      if (!matched) continue;
      // targets: the native name, plus any alias that is itself a native type here (GF <-> DNp01)
      for (const cand of [native, ...aliases]) {
        const id = byName.get(cand.toLowerCase());
        if (id == null || seen.has(id)) continue;
        const exact = matched.toLowerCase() === q;
        hits.push({ id, name: t.names[id], count: t.counts[id], superClass: t.super_class[id], via: matched, rank: exact ? 1 : 3 });
        seen.add(id);
      }
    }
  }
  hits.sort((a, b) => a.rank - b.rank || b.count - a.count || a.name.localeCompare(b.name));
  return hits.slice(0, limit).map(({ rank: _r, ...h }) => h);   // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Indices of every neuron with this type id. */
export function neuronsOfType(ids: Uint16Array, id: number): Int32Array {
  let n = 0;
  for (let i = 0; i < ids.length; i++) if (ids[i] === id) n++;
  const out = new Int32Array(n);
  for (let i = 0, k = 0; i < ids.length; i++) if (ids[i] === id) out[k++] = i;
  return out;
}

export interface TypeActivity { id: number; name: string; superClass: string; n: number; active: number; hz: number; spikes: number }

/**
 * Which cell types fired, from per-neuron spike counts over `sinceMs` of simulated time.
 * hz = mean spikes per neuron per second across the whole type (so a type where 1 of 100 neurons fired scores low);
 * active = how many of the type's neurons fired at all. Untyped neurons (id 0) are skipped.
 */
export function activityByType(counts: Uint32Array | number[], ids: Uint16Array, t: TypeTable, sinceMs: number, minNeurons = 2): TypeActivity[] {
  const spikes = new Float64Array(t.names.length), active = new Uint32Array(t.names.length);
  for (let i = 0; i < ids.length; i++) {
    const c = counts[i];
    if (c > 0) { spikes[ids[i]] += c; active[ids[i]]++; }
  }
  const secs = Math.max(sinceMs, 1) / 1000;
  const out: TypeActivity[] = [];
  for (let id = 1; id < t.names.length; id++) {
    if (spikes[id] === 0 || t.counts[id] < minNeurons) continue;
    out.push({ id, name: t.names[id], superClass: t.super_class[id], n: t.counts[id], active: active[id], hz: spikes[id] / t.counts[id] / secs, spikes: spikes[id] });
  }
  return out.sort((a, b) => b.hz - a.hz || b.active - a.active);
}

/**
 * Where to look this cell type up outside the explorer (ROADMAP item 56): Codex for FlyWire types,
 * neuPrint for MaleCNS types, Virtual Fly Brain for both. Deep links only where the site documents the
 * URL (Codex `filter_string`, neuPrint "find neurons"); Neuroglancer needs per-dataset segment ids and
 * is left out rather than linked wrong. The toy has no external home.
 */
export function externalLinks(dataset: string, typeName: string): { label: string; href: string }[] {
  const t = encodeURIComponent(typeName);
  if (dataset === "flywire783") {
    return [
      { label: "Codex", href: `https://codex.flywire.ai/app/search?dataset=fafb&filter_string=${encodeURIComponent(`cell_type == ${typeName}`)}` },
      { label: "Virtual Fly Brain", href: `https://v2.virtualflybrain.org/org.geppetto.frontend/geppetto?q=${t},search` },
    ];
  }
  if (dataset === "malecns") {
    const ds = encodeURIComponent("male-cns:v1.0");
    return [
      { label: "neuPrint", href: `https://neuprint.janelia.org/?dataset=${ds}&qt=findneurons&q=1&qr%5B0%5D%5Bcode%5D=fn&qr%5B0%5D%5Bds%5D=${ds}&qr%5B0%5D%5Bpm%5D%5Bdataset%5D=${ds}&qr%5B0%5D%5Bpm%5D%5Bneuron_name%5D=${t}&qr%5B0%5D%5Bpm%5D%5Benable_contains%5D=true` },
      { label: "Virtual Fly Brain", href: `https://v2.virtualflybrain.org/org.geppetto.frontend/geppetto?q=${t},search` },
    ];
  }
  return [];
}
