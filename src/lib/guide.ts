/** Which one-line narration the explorer should show, from the current readouts. Pure, so it is unit-tested. */
export type GuideKey = "loading" | "prompt" | "never_stops" | "jump" | "both" | "escape" | "feed" | "descending" | "stimulating" | "quiet";

export interface GuideInput {
  ready: boolean; pressed: boolean;
  mn9: number; gf: number; dn: number; net: number;   // Hz
  ttmn?: number;                                       // jump-muscle motor neuron, MaleCNS only
  stimming: boolean; sinceEndMs: number;              // sim ms since the last stimulus ended (0 while stimulating)
}

/** A real fly is at rest within ~1 s of a stimulus ending; we flag persistent activity after 1.5 s. */
export const NEVER_STOPS_AFTER_MS = 1500;
export const NEVER_STOPS_NET_HZ = 0.3;

export function guideKey(i: GuideInput): GuideKey {
  if (!i.ready) return "loading";
  if (!i.pressed) return "prompt";
  if (!i.stimming && i.sinceEndMs > NEVER_STOPS_AFTER_MS && i.net > NEVER_STOPS_NET_HZ) return "never_stops";
  if ((i.ttmn ?? 0) > 5) return "jump";
  if (i.gf > 5 && i.mn9 > 5) return "both";
  if (i.gf > 5) return "escape";
  if (i.mn9 > 5) return "feed";
  if (i.dn > 2) return "descending";
  if (i.stimming) return "stimulating";
  return "quiet";
}
