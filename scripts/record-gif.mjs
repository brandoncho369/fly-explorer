// Record the explorer for the README: load the real brain, press sugar GRNs, capture ~5 s of frames.
// `npm start -- -p 3123 &` then `node scripts/record-gif.mjs [outdir]`; assemble with scripts/make-gif.py.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.URL ?? "http://localhost:3123";
const out = process.argv[2] ?? "gif-frames";
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
await p.goto(`${URL}/?dataset=flywire783&gain=0.45`, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.body.innerText.includes("139,255"), null, { timeout: 120000 });
await p.getByRole("button", { name: "⟳ spinning" }).click().catch(() => {});   // hold still for the recording
await p.waitForTimeout(1500);
let i = 0;
const snap = async () => { await p.screenshot({ path: `${out}/f${String(i++).padStart(3, "0")}.png` }); };
for (let k = 0; k < 6; k++) { await snap(); await p.waitForTimeout(120); }
await p.getByRole("button", { name: /^sugar GRNs/ }).click();
for (let k = 0; k < 40; k++) { await snap(); await p.waitForTimeout(120); }
await b.close();
console.log(`${i} frames in ${out}`);
