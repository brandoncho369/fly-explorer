// Abuse test: hammer every control at once, change variables mid-sim, switch datasets while holding.
// `npm run build && npm start -- -p 3123 &` then `node scripts/stress.mjs`.
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3123";
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error" && !/_vercel\/insights/.test(m.location()?.url ?? "")) errs.push("console: " + m.text()); });
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) process.exitCode = 1; };
const aside = () => p.locator("aside").innerText();
const netRate = async () => +((await aside()).match(/whole network\s*\n\s*([\d.]+) Hz/)?.[1] ?? NaN);
const simT = async () => +((await aside()).match(/t = ([\d.]+) s/)?.[1] ?? NaN);

await p.goto(URL, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.body.innerText.includes("2,216"), null, { timeout: 30000 });
await p.getByRole("button", { name: "turn off" }).click().catch(() => {});

// 1. click every sense button as fast as possible, ten times over
const senses = await p.getByRole("button", { name: /^(sugar|bitter|water|looming|olfactory|JO|photoreceptors|descending)/ }).all();
console.log(`${senses.length} sense buttons`);
for (let r = 0; r < 10; r++) for (const s of senses) await s.click({ delay: 0 });
await p.waitForTimeout(500);
check(errs.length === 0, `spam-clicking ${senses.length} senses ×10: no errors`);
check(Number.isFinite(await simT()), "sim time still advancing after spam");

// 2. hold everything at once, then change gain and rate mid-sim
const holds = await p.getByRole("button", { name: /^hold / }).all();
for (const h of holds) await h.click();
await p.waitForTimeout(400);
const pressed = await p.getByRole("button", { name: /^hold /, pressed: true }).count();
check(pressed === holds.length, `all ${holds.length} senses held`);
await p.getByLabel("gain", { exact: true }).fill("2");
await p.waitForTimeout(400);
check(errs.length === 0, "gain change while everything is held: no errors");
await p.getByLabel("gain", { exact: true }).fill("1");
await p.waitForTimeout(800);
const netBefore = await netRate();
await p.getByLabel("input rate (Hz)").fill("300");
await p.waitForTimeout(800);
const netAfterRate = await netRate();
console.log(`  network rate at 100 Hz input: ${netBefore} Hz; after rate slider → 300 Hz: ${netAfterRate} Hz`);
check(netAfterRate > netBefore * 1.5, "raising the input rate while senses are held actually changes the held drive");
await p.getByLabel("input rate (Hz)").fill("100");
const t0 = await simT(); await p.waitForTimeout(1000); const t1 = await simT();
check(t1 > t0, `sim keeps advancing under full load (${(t1 - t0).toFixed(2)} sim-s per wall-s)`);

// 3. speed changes, pause/run, reset while held
for (const label of ["0.05×", "4×", "1×", "0.25×"]) { const btn = p.getByRole("button", { name: label, exact: true }); if (await btn.count()) await btn.click(); }
await p.getByRole("button", { name: "pause", exact: true }).click();
await p.getByRole("button", { name: "run", exact: true }).click();
await p.getByRole("button", { name: "reset", exact: true }).click();
await p.waitForTimeout(300);
check((await p.getByRole("button", { name: /^hold /, pressed: true }).count()) === 0, "reset releases every held sense in the UI");
await p.waitForTimeout(400);
check((await netRate()) === 0, "…and the brain is actually quiet afterwards");

// 4. hold, then switch dataset while holding (to the real brain if it is exported locally, else back to toy)
for (const h of holds.slice(0, 3)) await h.click();
await p.waitForTimeout(200);
const hasReal = (await fetch(`${URL}/data/flywire783/meta.json`)).ok;
await p.locator("select").first().selectOption({ index: hasReal ? 1 : 0 });
await p.waitForFunction((real) => document.body.innerText.includes(real ? "139," : "2,216"), hasReal, { timeout: 120000 });
await p.waitForTimeout(800);
const stillPressed = await p.getByRole("button", { name: /^hold /, pressed: true }).count();
check(stillPressed === 0, `switching dataset while holding clears the held buttons (${stillPressed} still shown pressed)`);
check((await netRate()) < 1, "…and nothing is being driven in the freshly loaded brain");

// 5. fly mode on/off rapidly with senses held
for (const h of holds.slice(0, 2)) await h.click();
for (let i = 0; i < 6; i++) await p.getByRole("button", { name: /fly mode/i }).first().click();
await p.waitForTimeout(400);
check(errs.length === 0, "toggling fly mode repeatedly with senses held: no errors");

// 6. cell-type search: fire and hold many types back to back, then switch dataset with cell types held
const search = p.getByLabel("cell type search");
await p.waitForFunction(() => !document.querySelector('[aria-label="cell type search"]')?.disabled, null, { timeout: 60000 });
let fired = 0, heldTypes = 0;
for (const q of ["a", "n", "l", "g", "o"]) {
  await search.fill(q);
  const opts = await p.getByRole("listbox").getByRole("option").all();
  for (const o of opts.slice(0, 4)) {
    await o.click();
    await p.getByRole("button", { name: /^fire / }).click(); fired++;
    if (heldTypes < 5) { await p.getByRole("button", { name: /^hold / }).last().click(); heldTypes++; }
    await search.fill(q);
  }
}
await p.waitForTimeout(500);
check(errs.length === 0, `fired ${fired} cell types and held ${heldTypes} back to back: no errors`);
check((await netRate()) > 0, "held cell types keep the network driven");
await p.getByRole("button", { name: "release all held senses" }).click();
await p.waitForTimeout(300);
check((await p.getByRole("button", { name: /^hold /, pressed: true }).count()) === 0, "release-all clears every held cell type");
// on the real brain the network keeps firing after release (that is the finding); reset is what silences it
await p.getByRole("button", { name: "reset", exact: true }).click();
await p.waitForTimeout(600);
check((await netRate()) < 1, `reset after held cell types silences the brain (network ${await netRate()} Hz)`);

if (errs.length) console.log(errs.join("\n"));
await b.close();
