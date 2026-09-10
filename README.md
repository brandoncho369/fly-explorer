# fly-explorer

**A fruit fly connectome running as a spiking neural network, live, in your browser.**

Each dot is one of the ~140,000 neurons in the [FlyWire](https://flywire.ai) adult *Drosophila* connectome. Each edge is a real synapse count. Every neuron is the same five-constant leaky integrate-and-fire unit from [Shiu et al. 2024 (Nature)](https://www.nature.com/articles/s41586-024-07763-9). Press **sugar GRNs** and watch the activity propagate from the taste receptors through the subesophageal zone to **MN9**, the motor neuron that extends the proboscis. Press **looming** and watch the **Giant Fiber** fire. Add **bitter** on top of sugar and watch MN9 go quiet.

Nothing is scripted. There is no per-neuron tuning. When MN9 lights up, the wiring did that.

> Ships with a 2k-neuron synthetic "toy" connectome so it runs instantly. To load the real brain, see [Loading FlyWire](#loading-flywire) — it's one command with the sibling repo **flybench**.

## How it works

```
public/data/<name>/      compact binary export (positions, CSR graph, classes, population index)
src/workers/lif.worker   the simulation — LIF integration + event-driven synaptic propagation
src/components/Brain     three.js point cloud; per-neuron activity → colour/size via a small shader
src/app/page             controls, readouts, worker plumbing
```

The worker owns the whole state: `V` (membrane, mV), `g` (synaptic drive, mV), a refractory clock, and a ring buffer of spike lists for the 1.8 ms conduction delay. Each 0.1 ms tick it (1) delivers the spikes whose delay expired by walking those neurons' CSR rows, (2) integrates every neuron, (3) forces Poisson spikes onto any population you're stimulating, (4) queues this tick's spikes. Only neurons that spiked touch the synapse arrays, so cost tracks activity rather than the 2.7 M edges. It posts an activity byte per neuron to the main thread every animation frame; the GPU does the rest.

Model constants (all editable in `src/lib/types.ts`, gain is a live slider):

| V_rest / V_reset | V_th | τ_m | τ_syn | refractory | delay | w per synapse |
|---|---|---|---|---|---|---|
| −52 mV | −45 mV | 20 ms | 5 ms | 2.2 ms | 1.8 ms | 0.275 mV × gain |

Signs: ACh +, GABA −, glutamate −, monoamines +. Edges with < 5 synapses are dropped.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, loads the toy connectome
```

## Loading FlyWire

The real export is ~35 MB and isn't committed. Build it once with [flybench](../flybench):

```bash
# in ../flybench, after downloading the Codex v783 CSVs (free account) — see its README
pip install -e .
flybench build ~/Downloads/flywire783
flybench export -c flywire783 -o ../fly-explorer/public/data/flywire783
```

Then pick **FlyWire v783** in the dropdown. A 140k-neuron brain steps at roughly 0.05–0.3 ms of compute per 0.1 ms of simulated time on a laptop, so the default 10 steps/frame is close to real time while the brain is quiet and slows gracefully when it isn't.

You can also export any other connectome flybench can load — the format is five flat binary files plus a `meta.json`, documented in `flybench/export.py`.

## What this is, and isn't

This is a way to *see* a connectome compute: which populations answer which inputs, in what order, and how a global gain knob changes that. It's a good intuition pump for what a wiring diagram does and doesn't tell you.

It is **not a fly**. The model has no neuromodulators, no neuropeptides, no gap junctions, no plasticity, no spontaneous activity, no body, no sensory transduction — "sugar" here means forcing spikes onto ~60 neurons whose community label says *sugar*. Absolute firing rates should not be trusted, only the pattern of what responds. Nothing in this tab experiences anything; it's a very large, very fast lookup of "if these fire, those fire." Whether that stops being obviously true as models get richer is a real question — this one is far from it, and says so.

For a repeatable answer to "does this parameter set still reproduce known fly reflexes?", use [flybench](../flybench).

## Credits

FlyWire consortium (Dorkenwald et al. 2024; Schlegel et al. 2024) for the connectome; Shiu et al. 2024 for the model; the many people who proofread 140k neurons by hand.

MIT © Brandon Cho
