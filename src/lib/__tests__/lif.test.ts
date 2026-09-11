import { describe, expect, it } from "vitest";
import { LIFNetwork, RateWindow, csrFromEdges, seeded } from "../lif";
import { SHIU_2024 } from "../types";

const never = () => 1; // rng that never triggers a stimulus spike
const always = () => 0;

function run(net: LIFNetwork, ms: number) {
  const spikes: Array<[number, number]> = [];
  for (let s = 0; s < Math.round(ms / net.params.dt); s++) for (const i of net.step()) spikes.push([net.t, i]);
  return spikes;
}

describe("LIFNetwork", () => {
  it("is silent without input", () => {
    const net = new LIFNetwork(csrFromEdges(50, [[0, 1, 100]]), SHIU_2024, never);
    expect(run(net, 200)).toHaveLength(0);
  });

  it("a single spike cannot fire a target on its own, even through 40 synapses", () => {
    // 40 * 0.275 = 11 mV of synaptic drive, but it decays with tau_s = 5 ms while the membrane
    // integrates over tau_m = 20 ms, so the voltage peak is only ~2 mV of the 7 mV gap.
    const net = new LIFNetwork(csrFromEdges(2, [[0, 1, 40]]), SHIU_2024, always);
    net.addStimulus("s", Int32Array.from([0]), 1e6, 0.1); // exactly one forced spike
    expect(run(net, 40).filter(([, i]) => i === 1)).toHaveLength(0);
  });

  it("sustained drive through a strong synapse propagates after the conduction delay", () => {
    // neuron 0 fires at its refractory limit (~450 Hz) into 60 synapses: mean g ≈ 0.45 * 16.5 * 5 ≈ 37 mV
    const net = new LIFNetwork(csrFromEdges(2, [[0, 1, 60]]), SHIU_2024, always);
    net.addStimulus("s", Int32Array.from([0]), 1e6, 50);
    const spikes = run(net, 60);
    const s0 = spikes.filter(([, i]) => i === 0);
    const s1 = spikes.filter(([, i]) => i === 1);
    expect(s0.length).toBeGreaterThan(0);
    expect(s1.length).toBeGreaterThan(0);
    const latency = s1[0][0] - s0[0][0];
    expect(latency).toBeGreaterThanOrEqual(1.8);
    expect(latency).toBeLessThan(15); // delay + a few refractory cycles of charging
  });

  it("does not propagate a weak synapse", () => {
    const net = new LIFNetwork(csrFromEdges(2, [[0, 1, 5]]), SHIU_2024, always);   // 5 * 0.275 = 1.4 mV
    net.addStimulus("s", Int32Array.from([0]), 1e6, 0.1);
    expect(run(net, 30).filter(([, i]) => i === 1)).toHaveLength(0);
  });

  it("inhibitory (negative) weights suppress", () => {
    // 0 excites 2 strongly; 1 inhibits 2 strongly; drive both -> 2 stays quiet
    const g = csrFromEdges(3, [[0, 2, 40], [1, 2, -80]]);
    const net = new LIFNetwork(g, SHIU_2024, always);
    net.addStimulus("s", Int32Array.from([0, 1]), 1e6, 50);
    expect(run(net, 80).filter(([, i]) => i === 2)).toHaveLength(0);
  });

  it("respects the refractory period even for forced spikes", () => {
    const net = new LIFNetwork(csrFromEdges(1, []), SHIU_2024, always);
    net.addStimulus("s", Int32Array.from([0]), 1e6, 100);
    const n = run(net, 100).length;
    expect(n).toBeLessThanOrEqual(100 / SHIU_2024.tRef + 1);
    expect(n).toBeGreaterThan(100 / SHIU_2024.tRef - 2);
  });

  it("gain scales weights live without reset", () => {
    const net = new LIFNetwork(csrFromEdges(2, [[0, 1, 60]]), SHIU_2024, always);
    net.setParams({ gain: 0.1 });               // 60 * 0.275 * 0.1 = 1.65 mV per spike -> never propagates
    net.addStimulus("s", Int32Array.from([0]), 1e6, 50);
    expect(run(net, 60).filter(([, i]) => i === 1)).toHaveLength(0);
    const tBefore = net.t;
    net.setParams({ gain: 1 });
    expect(net.t).toBe(tBefore);                // no reset
    net.addStimulus("s", Int32Array.from([0]), 1e6, 50);
    expect(run(net, 60).filter(([, i]) => i === 1).length).toBeGreaterThan(0);
  });

  it("dt/delay changes reset state; other changes keep it", () => {
    const net = new LIFNetwork(csrFromEdges(1, []), SHIU_2024, always);
    net.addStimulus("s", Int32Array.from([0]), 1e6, 100);
    run(net, 10);
    expect(net.t).toBeCloseTo(10);
    net.setParams({ tauM: 30 });
    expect(net.t).toBeCloseTo(10);
    net.setParams({ delay: 3 });
    expect(net.t).toBe(0);
    expect(net.stims).toHaveLength(0);
  });

  it("a held stimulus (infinite duration) never expires until removed, and reset clears it", () => {
    const net = new LIFNetwork(csrFromEdges(3, []), SHIU_2024, always);
    net.addStimulus("hold", Int32Array.from([0]), 1e6, Number.POSITIVE_INFINITY);
    const spikes = run(net, 2000);
    expect(net.stims).toHaveLength(1);
    expect(spikes.length).toBeGreaterThan(500);            // kept firing for two seconds
    net.removeStimulus("hold");
    expect(net.stims).toHaveLength(0);
    expect(run(net, 50).length).toBe(0);                   // silent once released (no wiring)
    net.addStimulus("hold", Int32Array.from([0]), 1e6, Number.POSITIVE_INFINITY);
    net.reset();
    expect(net.stims).toHaveLength(0);
  });
  it("two overlapping stimuli both drive their neurons", () => {
    const net = new LIFNetwork(csrFromEdges(3, []), SHIU_2024, always);
    net.addStimulus("sugar", Int32Array.from([0]), 1e6, 100);
    net.addStimulus("bitter", Int32Array.from([1]), 1e6, 100);
    const ids = new Set(run(net, 50).map(([, i]) => i));
    expect(ids.has(0) && ids.has(1)).toBe(true);
  });
  it("ignores degenerate stimuli and expires finished ones", () => {
    const net = new LIFNetwork(csrFromEdges(3, []), SHIU_2024, always);
    net.addStimulus("empty", new Int32Array(0), 100, 100);
    net.addStimulus("zero-rate", Int32Array.from([0]), 0, 100);
    net.addStimulus("zero-duration", Int32Array.from([0]), 100, 0);
    expect(net.stims).toHaveLength(0);
    net.addStimulus("short", Int32Array.from([1]), 100, 5);
    run(net, 10);
    expect(net.stims).toHaveLength(0);
    net.addStimulus("a", Int32Array.from([1]), 100, 50);
    net.addStimulus("a", Int32Array.from([2]), 100, 50);   // same name replaces
    expect(net.stims).toHaveLength(1);
    expect(net.stims[0].neurons[0]).toBe(2);
  });

  it("is deterministic under a seeded rng", () => {
    const g = csrFromEdges(20, Array.from({ length: 40 }, (_, k) => [k % 20, (k * 7) % 20, 30] as [number, number, number]));
    const a = new LIFNetwork(g, SHIU_2024, seeded(1)); a.addStimulus("s", Int32Array.from([0, 1, 2]), 200, 100);
    const b = new LIFNetwork(g, SHIU_2024, seeded(1)); b.addStimulus("s", Int32Array.from([0, 1, 2]), 200, 100);
    expect(run(a, 100)).toEqual(run(b, 100));
  });

  it("caps stimulus probability at 1 for absurd rates", () => {
    const net = new LIFNetwork(csrFromEdges(1, []), SHIU_2024, always);
    net.addStimulus("s", Int32Array.from([0]), 1e9, 10);
    expect(net.stims[0].prob).toBe(1);
  });
});

describe("RateWindow", () => {
  it("computes mean Hz per neuron over the ring", () => {
    const w = new RateWindow(1000, 0.1, 2);   // 100 ms, population of 2
    for (let k = 0; k < 1000; k++) w.push(k % 10 === 0 ? 2 : 0);  // 100 steps with both neurons -> 100 spikes each per 100 ms? no: 100 events * 2 = 200 spikes / 2 neurons / 0.1 s
    expect(w.hz()).toBeCloseTo(1000);
    w.clear();
    expect(w.hz()).toBe(0);
    expect(new RateWindow(10, 0.1, 0).hz()).toBe(0);
  });
});

describe("csrFromEdges", () => {
  it("builds valid CSR regardless of edge order", () => {
    const g = csrFromEdges(3, [[2, 0, 1], [0, 2, 5], [0, 1, 3]]);
    expect(Array.from(g.indptr)).toEqual([0, 2, 2, 3]);
    expect(Array.from(g.indices)).toEqual([1, 2, 0]);
    expect(Array.from(g.weights)).toEqual([3, 5, 1]);
  });
});
