import { describe, expect, it } from "vitest";
import { activityByType, countsToCsv, externalLinks, neuronsOfType, searchTypes, type TypeTable } from "../celltypes";

const t: TypeTable = {
  names: ["", "MN9", "GF", "LPLC2", "LC4", "KCg-m", "DNp01"],
  counts: [3, 2, 2, 4, 1, 5, 2],
  super_class: ["other", "motor", "descending", "visual_projection", "visual_projection", "central", "descending"],
};
//            neuron: 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18
const ids = Uint16Array.from([0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 6, 6]);

describe("searchTypes", () => {
  it("exact, then prefix, then substring; never the untyped id", () => {
    expect(searchTypes(t, "lc4").map((h) => h.name)).toEqual(["LC4", "LPLC2"].filter((n) => n === "LC4"));
    expect(searchTypes(t, "L").map((h) => h.name)).toEqual(["LPLC2", "LC4"]);    // prefix, bigger first
    expect(searchTypes(t, "c").map((h) => h.name)).toEqual(["KCg-m", "LPLC2", "LC4"]); // substring, by size
    expect(searchTypes(t, "").length).toBe(0);
    expect(searchTypes(t, "zzz").length).toBe(0);
    expect(searchTypes(t, "n").some((h) => h.id === 0)).toBe(false);
  });
  it("respects the limit", () => {
    expect(searchTypes(t, "", 2).length).toBe(0);
    expect(searchTypes({ names: ["", "a1", "a2", "a3"], counts: [0, 1, 1, 1], super_class: ["", "", "", ""] }, "a", 2).length).toBe(2);
  });
});

describe("neuronsOfType", () => {
  it("returns every index with that id", () => {
    expect(Array.from(neuronsOfType(ids, 3))).toEqual([7, 8, 9, 10]);
    expect(Array.from(neuronsOfType(ids, 4))).toEqual([11]);
    expect(neuronsOfType(ids, 99).length).toBe(0);
  });
});

describe("activityByType", () => {
  it("ranks by mean rate per neuron of the whole type and reports how many were active", () => {
    const counts = new Uint32Array(ids.length);
    counts[3] = 50; counts[4] = 50;        // MN9: both neurons, 50 spikes each over 1 s -> 50 Hz
    counts[7] = 8;                          // LPLC2: 1 of 4 neurons, 8 spikes -> 2 Hz mean
    counts[12] = 1;                         // KCg-m: 1 of 5
    counts[0] = 1000;                       // untyped: ignored
    counts[11] = 100;                       // LC4 has only 1 neuron -> below minNeurons
    const a = activityByType(counts, ids, t, 1000);
    expect(a.map((x) => x.name)).toEqual(["MN9", "LPLC2", "KCg-m"]);
    expect(a[0]).toMatchObject({ n: 2, active: 2, hz: 50, spikes: 100 });
    expect(a[1]).toMatchObject({ n: 4, active: 1, hz: 2 });
    expect(activityByType(counts, ids, t, 1000, 1).some((x) => x.name === "LC4")).toBe(true);
  });
  it("scales with the window and handles an empty window", () => {
    const counts = new Uint32Array(ids.length); counts[3] = 10;
    expect(activityByType(counts, ids, t, 500)[0].hz).toBe(10);   // 10 spikes / 2 neurons / 0.5 s
    expect(activityByType(counts, ids, t, 0)[0].hz).toBeGreaterThan(0);
    expect(activityByType(new Uint32Array(ids.length), ids, t, 1000)).toEqual([]);
  });
});


describe("externalLinks", () => {
  it("links FlyWire types to Codex and VFB, MaleCNS types to neuPrint and VFB, the toy nowhere", () => {
    const fw = externalLinks("flywire783", "DNp01");
    expect(fw.map((l) => l.label)).toEqual(["Codex", "Virtual Fly Brain"]);
    expect(fw[0].href).toContain("codex.flywire.ai");
    expect(decodeURIComponent(fw[0].href)).toContain("cell_type == DNp01");
    const mc = externalLinks("malecns", "GF");
    expect(mc[0].label).toBe("neuPrint");
    expect(mc[0].href).toContain("male-cns");
    expect(externalLinks("toy", "MN9")).toEqual([]);
    expect(externalLinks("flywire783", "KCa'b'-m")[1].href).toContain(encodeURIComponent("KCa'b'-m"));
  });
});


describe("countsToCsv", () => {
  it("writes one row per neuron that fired, with its type, count and rate", () => {
    const t: TypeTable = { names: ["", "MN9", "GF"], counts: [0, 2, 2], super_class: ["", "motor", "descending"] };
    const ids = new Uint16Array([1, 1, 2, 2, 0]);
    const csv = countsToCsv([10, 0, 3, 0, 7], ids, t, 500);
    expect(csv.split("\n").filter(Boolean)).toEqual(["neuron_index,cell_type,spikes,hz", '0,"MN9",10,20.000', '2,"GF",3,6.000', '4,"",7,14.000']);
  });
});
