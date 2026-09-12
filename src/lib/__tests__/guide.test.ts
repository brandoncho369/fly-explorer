import { describe, expect, it } from "vitest";
import { NEVER_STOPS_AFTER_MS, guideKey } from "../guide";

const base = { ready: true, pressed: true, mn9: 0, gf: 0, dn: 0, net: 0, stimming: false, sinceEndMs: 0 };

describe("guide narration", () => {
  it("prompts until the visitor presses something", () => {
    expect(guideKey({ ...base, ready: false })).toBe("loading");
    expect(guideKey({ ...base, pressed: false })).toBe("prompt");
    expect(guideKey(base)).toBe("quiet");
  });
  it("names the neuron that is firing", () => {
    expect(guideKey({ ...base, mn9: 40 })).toBe("feed");
    expect(guideKey({ ...base, gf: 300 })).toBe("escape");
    expect(guideKey({ ...base, gf: 300, mn9: 40 })).toBe("both");
    expect(guideKey({ ...base, gf: 300, ttmn: 50 })).toBe("jump");     // the body wins over the brain-only caption
    expect(guideKey({ ...base, dn: 5 })).toBe("descending");
    expect(guideKey({ ...base, stimming: true })).toBe("stimulating");
  });
  it("flags activity that persists after the stimulus ended, and only then", () => {
    expect(guideKey({ ...base, mn9: 300, net: 5, sinceEndMs: NEVER_STOPS_AFTER_MS + 1 })).toBe("never_stops");
    expect(guideKey({ ...base, mn9: 300, net: 5, sinceEndMs: 500 })).toBe("feed");            // too soon to complain
    expect(guideKey({ ...base, mn9: 300, net: 5, sinceEndMs: 5000, stimming: true })).toBe("feed"); // still being stimulated
    expect(guideKey({ ...base, net: 0.1, sinceEndMs: 5000 })).toBe("quiet");                  // it did stop
  });
});
