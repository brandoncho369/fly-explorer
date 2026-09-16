import { describe, expect, it } from "vitest";
import { decodeState, encodeState, missingNames } from "../permalink";
import { searchTypes } from "../celltypes";
import synonyms from "../../data/synonyms.json";

describe("permalink", () => {
  it("round-trips dataset, gain, rate, held senses and held types", () => {
    const s = { dataset: "flywire783", gain: 0.45, rate: 150, hold: ["sugar GRNs", "looming (LPLC2/LC4)"], types: ["DNp01", "KCg-m"] };
    const q = encodeState(s);
    expect(q).toContain("dataset=flywire783");
    expect(decodeState(q, { dataset: "toy", gain: 1 })).toEqual(s);
  });
  it("omits defaults and falls back on garbage", () => {
    expect(encodeState({ dataset: "toy", gain: 1, rate: 100, hold: [], types: [] })).toBe("dataset=toy&gain=1");
    const d = decodeState("?dataset=&gain=-3&rate=9999&hold=,,&type=", { dataset: "toy", gain: 1 });
    expect(d).toEqual({ dataset: "toy", gain: 1, rate: 100, hold: [], types: [] });
  });
  it("caps the number of held names", () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    expect(decodeState(`hold=${many.join(",")}`, { dataset: "toy", gain: 1 }).hold).toHaveLength(8);
  });
  it("names what a link asks for that the dataset lacks", () => {
    expect(missingNames(["sugar GRNs", "jump muscle MN (TTMn)"], ["sugar GRNs", "MN9 (proboscis)"])).toEqual(["jump muscle MN (TTMn)"]);
  });
});

describe("synonym search", () => {
  const flywire = { names: ["", "DNp01", "MN9", "KCg-m", "V_ilPN", "CB0268"], counts: [0, 2, 2, 2000, 2, 2], super_class: ["", "descending", "motor", "central", "central", "central"] };
  const malecns = { names: ["", "GF", "MN9", "PS321"], counts: [0, 2, 2, 2], super_class: ["", "descending", "motor", "central"] };
  it("resolves an alias to the native name of the loaded dataset and says which alias matched", () => {
    const fw = searchTypes(flywire, "giant fiber", 8, synonyms);
    expect(fw.map((h) => h.name)).toEqual(["DNp01"]);
    expect(fw[0].via?.toLowerCase()).toBe("giant fiber");
    const mc = searchTypes(malecns, "giant fiber", 8, synonyms);
    expect(mc.map((h) => h.name)).toEqual(["GF"]);
  });
  it("finds the other dataset's native name as an alias (GF on FlyWire is DNp01, bIPS is CB0268 / PS321)", () => {
    expect(searchTypes(flywire, "GF", 8, synonyms).map((h) => h.name)).toEqual(["DNp01"]);
    expect(searchTypes(flywire, "bips", 8, synonyms).map((h) => h.name)).toEqual(["CB0268"]);
    expect(searchTypes(malecns, "bips", 8, synonyms).map((h) => h.name)).toEqual(["PS321"]);
    expect(searchTypes(flywire, "PNvbi", 8, synonyms).map((h) => h.name)).toEqual(["V_ilPN"]);
  });
  it("never returns a name the dataset does not have, and direct matches come first without a via", () => {
    expect(searchTypes(malecns, "KCg", 8, synonyms)).toEqual([]);
    const direct = searchTypes(flywire, "MN9", 8, synonyms);
    expect(direct[0].name).toBe("MN9");
    expect(direct[0].via).toBeUndefined();
  });
});
