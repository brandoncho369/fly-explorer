/** Permalinks for an explorer experiment (ROADMAP item 53): dataset, gain, input rate, and what is held on —
 *  senses by population name, cell types by type name. Pure and unit-tested; the page applies it on load and
 *  writes it back on "copy link". Names are URL-encoded as-is; readouts are fixed per dataset and not encoded. */

export interface ExplorerState {
  dataset: string;
  gain: number;
  rate: number;          // input rate, Hz
  hold: string[];        // held sense populations (keys of meta.populations)
  types: string[];       // held cell types (names from types.json)
}

export const MAX_HELD = 8;   // a link with more than this is a bug or an attack; keep URLs short

export function encodeState(s: ExplorerState): string {
  const q = new URLSearchParams();
  q.set("dataset", s.dataset);
  q.set("gain", String(+s.gain.toFixed(3)));
  if (s.rate !== 100) q.set("rate", String(Math.round(s.rate)));
  if (s.hold.length) q.set("hold", s.hold.slice(0, MAX_HELD).join(","));
  if (s.types.length) q.set("type", s.types.slice(0, MAX_HELD).join(","));
  return q.toString();
}

const list = (v: string | null): string[] => (v ? v.split(",").map((x) => x.trim()).filter(Boolean).slice(0, MAX_HELD) : []);

/** Parse a query string; unknown or malformed values fall back to the defaults given. */
export function decodeState(search: string, defaults: { dataset: string; gain: number; rate?: number }): ExplorerState {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const gain = parseFloat(q.get("gain") ?? "");
  const rate = parseFloat(q.get("rate") ?? "");
  return {
    dataset: q.get("dataset") || defaults.dataset,
    gain: gain > 0 && gain <= 5 ? gain : defaults.gain,
    rate: rate >= 1 && rate <= 500 ? Math.round(rate) : (defaults.rate ?? 100),
    hold: list(q.get("hold")),
    types: list(q.get("type")),
  };
}

/** Names a link asked for that this dataset does not have: shown as a banner, never silently dropped. */
export function missingNames(requested: string[], available: Iterable<string>): string[] {
  const have = new Set(Array.from(available, (n) => n.toLowerCase()));
  return requested.filter((n) => !have.has(n.toLowerCase()));
}
