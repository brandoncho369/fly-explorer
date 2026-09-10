// Headless smoke test: `npm run build && npm start -- -p 3123 &` then `node scripts/smoke.mjs`.
// Needs playwright installed somewhere on the machine (`npm i -g playwright && npx playwright install chromium`).
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3123";
const exe = process.env.CHROME; // optional executablePath
const b = await chromium.launch({ executablePath: exe, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
const aside = () => p.locator("aside").innerText();
const mn9 = async () => +((await aside()).match(/MN9 \(proboscis\)[^\d]*?(\d+)\s*$/m)?.[1] ?? NaN);
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) process.exitCode = 1; };

await p.goto(URL, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.body.innerText.includes("2,004"), null, { timeout: 30000 });
check(true, "toy loads");

// hints open and close
await p.getByRole("button", { name: "What is gain?" }).click();
check(await p.getByRole("tooltip").isVisible(), "gain hint opens");
await p.keyboard.press("Escape");
check((await p.getByRole("tooltip").count()) === 0, "hint closes on Escape");

// stimulate on toy
await p.getByRole("button", { name: /^sugar GRNs/ }).click();
let peak = 0; for (let i = 0; i < 10; i++) { await p.waitForTimeout(300); peak = Math.max(peak, await mn9()); }
check(peak > 10, `toy: sugar drives MN9 (peak ${peak} Hz)`);

// reset clears activity
await p.getByRole("button", { name: "reset", exact: true }).click();
await p.waitForTimeout(400);
check((await mn9()) === 0, "reset silences MN9");

// pause freezes time
await p.getByRole("button", { name: "pause", exact: true }).click();
const t1 = (await aside()).match(/t = ([\d.]+) s/)[1];
await p.waitForTimeout(500);
const t2 = (await aside()).match(/t = ([\d.]+) s/)[1];
check(t1 === t2, "pause freezes simulated time");
await p.getByRole("button", { name: "run", exact: true }).click();

// real dataset if present
const r = await p.request.get(`${URL}/data/flywire783/meta.json`);
if (r.ok()) {
  await p.selectOption("select", "flywire783");
  await p.waitForFunction(() => document.body.innerText.includes("139,255"), null, { timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('input[aria-label="gain"]')?.value === "0.45", null, { timeout: 10000 }).catch(() => {});
  check((await p.getByLabel("gain", { exact: true }).inputValue()) === "0.45", "flywire preset gain applied");
  await p.getByRole("button", { name: /^sugar GRNs/ }).click();
  peak = 0; for (let i = 0; i < 12; i++) { await p.waitForTimeout(400); peak = Math.max(peak, await mn9()); }
  check(peak > 10, `flywire: sugar drives MN9 (peak ${peak} Hz)`);
  await p.getByRole("button", { name: "reset", exact: true }).click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /^looming/ }).click();
  let gf = 0; for (let i = 0; i < 12; i++) { await p.waitForTimeout(400); gf = Math.max(gf, +((await aside()).match(/Giant Fiber[^\d]*?(\d+)\s*$/m)?.[1] ?? 0)); }
  check(gf > 10, `flywire: looming drives Giant Fiber (peak ${gf} Hz)`);
  await p.screenshot({ path: "smoke-flywire.png" });
} else console.log("· flywire783 export not present, skipped");

check(errs.length === 0, "no page/console errors" + (errs.length ? ": " + errs.join(" | ") : ""));
await b.close();
