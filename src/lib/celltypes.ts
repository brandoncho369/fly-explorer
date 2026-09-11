/** Cell-type tools for the explorer: search the real annotation, and summarise which types fired. Pure, unit-tested. */

export interface TypeTable { names: string[]; counts: number[]; super_class: string[] }

export interface TypeHit { id: number; name: string; count: number; superClass: string }

/** Substring search over type names, exact/prefix matches first, then by population size. Id 0 (untyped) is never returned. */
export function searchTypes(t: TypeTable, query: string, limit = 8): TypeHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: (TypeHit & { rank: number })[] = [];
  for (let id = 1; id < t.names.length; id++) {
    const name = t.names[id], lc = name.toLowerCase();
    const at = lc.indexOf(q);
    if (at < 0) continue;
    const rank = lc === q ? 0 : at === 0 ? 1 : 2;
    hits.push({ id, name, count: t.counts[id], superClass: t.super_class[id], rank });
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
