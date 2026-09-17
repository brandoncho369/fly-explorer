// Headless smoke test: `npm run build && npm start -- -p 3123 &` then `node scripts/smoke.mjs`.
// Needs playwright installed somewhere on the machine (`npm i -g playwright && npx playwright install chromium`).
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3123";
const exe = process.env.CHROME; // optional executablePath
const b = await chromium.launch({ executablePath: exe, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
// the Vercel Analytics script only exists on Vercel; its 404 locally is expected
p.on("console", (m) => { if (m.type() === "error" && !/_vercel\/insights/.test(m.location()?.url ?? "")) errs.push("console: " + m.text()); });
const aside = () => p.locator("aside").innerText();
const mn9 = async () => +((await aside()).match(/MN9 \(proboscis\)[^\d]*?(\d+)\s*$/m)?.[1] ?? NaN);
const check = (ok, msg) => { console.log((ok ? "✓ " : "✗ ") + msg); if (!ok) process.exitCode = 1; };

await p.goto(URL, { waitUntil: "networkidle" });
await p.waitForFunction(() => document.body.innerText.includes("3,790"), null, { timeout: 30000 });
check(true, "toy loads");
const guide = async () => (await p.getByTestId("guide").innerText());
check(/Try it: press sugar GRNs/.test(await guide()), "guide: first-run prompt");

// hover help: one panel, never widens the page, can be turned off
await p.getByLabel("gain", { exact: true }).hover();
check((await p.getByRole("status").innerText()).includes("volume knob"), "hovering gain explains it in the panel");
await p.getByRole("button", { name: /^bitter GRNs/ }).hover();
check((await p.getByRole("status").innerText()).includes("bitter"), "hovering another control swaps the topic");
check((await p.evaluate(() => document.documentElement.scrollWidth)) <= 1400, "help panel does not widen the page");
{ // hovering must never move the controls (the help panel has a fixed height)
  const btn = p.getByRole("button", { name: "reset", exact: true });
  const y0 = (await btn.boundingBox()).y;
  await p.getByRole("button", { name: /^photoreceptors|^olfactory/ }).first().hover();
  await p.waitForTimeout(150);
  check(Math.abs((await btn.boundingBox()).y - y0) < 1, "hovering a control does not shift the layout");
}
await p.getByRole("button", { name: "turn off" }).click();
check((await p.getByRole("status").innerText()).includes("help is off"), "help can be turned off");
await p.getByRole("button", { name: "turn on" }).click();
for (const name of ["sugar GRNs", "bitter GRNs", "looming (LPLC2/LC4)"]) {
  const hl = p.getByRole("button", { name: `highlight ${name}` });
  check(await hl.isVisible() && (await hl.boundingBox()).width >= 30, `highlight button reachable: ${name}`);
}

// spin toggle
await p.getByRole("button", { name: /spinning/ }).click();
check((await p.getByRole("button", { name: /^⟳ spin$/ }).count()) === 1, "spin toggle stops rotation");

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

// guide narrates MN9, then notices that activity never stops
await p.getByRole("button", { name: /^sugar GRNs/ }).click();
let g = ""; for (let i = 0; i < 20 && !/MN9 is firing/.test(g); i++) { await p.waitForTimeout(250); g = await guide(); }
check(/MN9 is firing/.test(g), "guide: MN9 caption");
await p.getByRole("button", { name: "reset", exact: true }).click();
await p.waitForTimeout(500);
check(/Quiet/.test(await guide()), "guide: quiet after reset");

// fly mode: rush the cursor at the fly; the giant fiber should fire and the fly should move
await p.getByRole("button", { name: "reset", exact: true }).click();
await p.getByRole("button", { name: /fly mode/ }).click();
const arena = p.getByTestId("fly-arena");
const ab = await arena.boundingBox();
const flyEl = p.getByLabel("fly", { exact: true });
const before = await flyEl.boundingBox();
// approach from the left edge to the fly's centre in a fast sweep, repeated; sample the HUD as we go
let loomPeak = 0, gfPeak = 0;
for (let rep = 0; rep < 4; rep++) {
  const cx = before.x + before.width / 2, cy = before.y + before.height / 2;
  await p.mouse.move(ab.x + 5, cy);
  for (let k = 1; k <= 12; k++) {
    await p.mouse.move(ab.x + 5 + (cx - ab.x - 5) * (k / 12), cy); await p.waitForTimeout(12);
    loomPeak = Math.max(loomPeak, +((await p.getByTestId("fly-hud").innerText()).match(/cursor: (\d+)/)?.[1] ?? 0));
  }
  for (let i = 0; i < 8; i++) { await p.waitForTimeout(100); gfPeak = Math.max(gfPeak, +((await p.getByTestId("fly-hud").innerText()).match(/giant fiber: (\d+)/)?.[1] ?? 0)); }
}
check(/looming detectors/.test(await p.getByTestId("fly-hud").innerText()), "fly mode: HUD present");
check(loomPeak >= 30, `fly mode: rushing the cursor drives the looming detectors (peak ${loomPeak} Hz)`);
check(gfPeak > 5, `fly mode: the giant fiber fires (peak ${gfPeak} Hz)`);
const after = await flyEl.boundingBox();
check(Math.hypot(after.x - before.x, after.y - before.y) > 30, "fly mode: the fly flew away");
check(/escapes: \d/.test(await p.getByTestId("fly-hud").innerText()), "fly mode: landing counted and brain reset");
await p.getByRole("button", { name: /fly mode/ }).click();
await p.getByRole("button", { name: "reset", exact: true }).click();

// cell-type search: find and fire a type by name, then see it in the "what fired" table
await p.getByRole("button", { name: "reset", exact: true }).click();
const search = p.getByLabel("cell type search");
await search.fill("ORN");
await p.getByRole("listbox").getByRole("option").first().click();
check(/fire ORN/.test(await p.getByTestId("celltypes").innerText()), "cell type picked from search");
await p.getByRole("button", { name: /^fire ORN/ }).click();
let fired = ""; for (let i = 0; i < 20 && !/ORN/.test(fired); i++) { await p.waitForTimeout(400); fired = (await p.getByTestId("fired-table").innerText().catch(() => "")); }
check(/ORN.*input/.test(fired.replace(/\n/g, " ")), "what-fired table lists the stimulated type as input");
check(/Toy network/.test(await p.getByTestId("trust").innerText()), "trust line: toy disclaimer");
await p.getByRole("button", { name: "reset", exact: true }).click();

// hold toggle: sense stays on, release stops it
await p.getByRole("button", { name: "reset", exact: true }).click();
await p.getByRole("button", { name: "hold sugar GRNs" }).click();
await p.waitForTimeout(1500);
check((await p.getByRole("button", { name: "hold sugar GRNs" }).getAttribute("aria-pressed")) === "true", "hold button shows pressed");
check((await p.getByText("release all held senses").count()) === 1, "release-all appears while holding");
let heldPeak = 0; for (let i = 0; i < 6; i++) { await p.waitForTimeout(300); heldPeak = Math.max(heldPeak, await mn9()); }
check(heldPeak > 10, `held sugar keeps MN9 firing (peak ${heldPeak} Hz)`);
await p.getByRole("button", { name: "hold sugar GRNs" }).click();
check((await p.getByRole("button", { name: "hold sugar GRNs" }).getAttribute("aria-pressed")) === "false", "hold released");
await p.getByRole("button", { name: "reset", exact: true }).click();

// real dataset if present
const r = await p.request.get(`${URL}/data/flywire783/meta.json`);
if (r.ok()) {
  await p.selectOption("select", "flywire783");
  await p.waitForFunction(() => document.body.innerText.includes("139,255"), null, { timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('input[aria-label="gain"]')?.value === "0.45", null, { timeout: 10000 }).catch(() => {});
  check((await p.getByLabel("gain", { exact: true }).inputValue()) === "0.45", "flywire preset gain applied");
  await p.getByRole("button", { name: /^sugar GRNs/ }).click();
  // the real brain steps slowly in headless Chromium (~0.01x real time), so poll until it fires or 20 s pass
  peak = 0; for (let i = 0; i < 90 && peak <= 10; i++) { await p.waitForTimeout(400); peak = Math.max(peak, await mn9()); }
  check(peak > 10, `flywire: sugar drives MN9 (peak ${peak} Hz)`);
  check(/gain 0.45.*5\/5 core/.test(await p.getByTestId("trust").innerText()), "trust line quotes the benchmark at this gain");
  await p.getByLabel("cell type search").fill("DNp0");
  check((await p.getByRole("listbox").getByRole("option").count()) >= 3, "real cell types searchable (DNp0…)");
  await p.getByRole("button", { name: "reset", exact: true }).click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /^looming/ }).click();
  let gf = 0; for (let i = 0; i < 12; i++) { await p.waitForTimeout(400); gf = Math.max(gf, +((await aside()).match(/Giant Fiber[^\d]*?(\d+)\s*$/m)?.[1] ?? 0)); }
  check(gf > 10, `flywire: looming drives Giant Fiber (peak ${gf} Hz)`);
  await p.screenshot({ path: "smoke-flywire.png" });
} else console.log("· flywire783 export not present, skipped");

// /bench page
for (const w of [1300, 400]) {
  const q = await b.newPage({ viewport: { width: w, height: 1200 } });
  await q.goto(`${URL}/bench`, { waitUntil: "networkidle" });
  const sw = await q.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= w, `/bench @${w}px: no horizontal overflow (scrollWidth ${sw})`);
  check((await q.locator("h1").innerText()).includes("simulated fly"), `/bench @${w}px: headline`);
  check((await q.locator("svg[role=img]").count()) === 2, `/bench @${w}px: two gain charts`);
  check((await q.locator("#leaderboard tbody tr").count()) >= 5, `/bench @${w}px: leaderboard rows`);
  check((await q.locator("#tasks article").count()) === 32, `/bench @${w}px: 32 task cards`);
  const cta = q.getByRole("link", { name: /Submit a result/ }).first();
  check((await cta.boundingBox())?.y < 900, `/bench @${w}px: contribute CTA above the fold`);
  check((await q.getByRole("link", { name: /Add a task or a model/ }).getAttribute("href")).includes("/blob/HEAD/"), `/bench @${w}px: links use HEAD not main`);
  await q.locator("svg[role=img] rect[tabindex]").first().hover();
  check((await q.locator("svg[role=img] text").filter({ hasText: /gain 0\.3 ·/ }).count()) >= 1, `/bench @${w}px: chart hover tooltip`);
  await q.close();
}

// /submit page: form -> GitHub new-file URL
{
  const q = await b.newPage({ viewport: { width: 1300, height: 1000 } });
  await q.goto(`${URL}/?gain=0.4`, { waitUntil: "networkidle" });
  await q.waitForFunction(() => document.querySelector('input[aria-label="gain"]')?.value === "0.4", null, { timeout: 15000 }).catch(() => {});
  check((await q.getByLabel("gain", { exact: true }).inputValue()) === "0.4", "?gain= sets the explorer gain");
  await q.goto(`${URL}/submit`, { waitUntil: "networkidle" });
  check((await q.getByRole("link", { name: /Watch this gain in the explorer/ }).getAttribute("href")) === "/?dataset=flywire783&gain=0.45", "submit links to the explorer with its gain");
  const btn = q.getByText(/Open pull request/);
  check((await btn.getAttribute("aria-disabled")) === "true", "/submit: button disabled until the form is valid");
  await q.getByPlaceholder(/jane/).fill("smoke test run");
  await q.getByPlaceholder(/otherwise Shiu/).fill("just a smoke test");
  const href = await btn.getAttribute("href");
  check(!!href && href.startsWith("https://github.com/brandoncho369/flybench/new/") && href.includes("configs%2Fsubmissions%2Fsmoke-test-run.yaml"), "/submit: builds a GitHub new-file URL");
  const yaml = decodeURIComponent(href.split("value=")[1]);
  check(yaml.includes("label: smoke test run") && yaml.includes("gain: 0.45") && yaml.includes("seeds: 3"), "/submit: YAML carries the form values");
  await q.getByLabel("model").selectOption({ index: 1 });
  check((await q.getByTestId("yaml").innerText()).includes("b_mv: 2"), "/submit: adaptive model adds its constants");
  const sw = await q.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 1300, "/submit: no horizontal overflow");
  await q.close();
}

check(errs.length === 0, "no page/console errors" + (errs.length ? ": " + errs.join(" | ") : ""));
// permalinks (ROADMAP item 53): the address bar holds the experiment; names the dataset lacks are banner-ed, never substituted
{
  const p2 = await b.newPage({ viewport: { width: 1400, height: 860 } });
  p2.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await p2.goto(`${URL}/?dataset=toy&gain=0.8&rate=150&hold=sugar%20GRNs,nothing%20here&type=MN9`, { waitUntil: "networkidle" });
  await p2.waitForFunction(() => document.body.innerText.includes("3,790"), null, { timeout: 30000 });
  await p2.waitForTimeout(1500);
  const text = await p2.locator("aside").innerText();
  check(/0\.80×/.test(text), "permalink: gain applied");
  check(/150 Hz/.test(text), "permalink: input rate applied");
  check((await p2.getByRole("button", { name: "hold sugar GRNs" }).getAttribute("aria-pressed")) === "true", "permalink: held sense is on");
  check(/not in this dataset: nothing here/.test(text), "permalink: an unknown name is banner-ed, not dropped");
  await p2.getByRole("button", { name: "copy link to this experiment" }).click();
  await p2.waitForTimeout(200);
  const href = await p2.evaluate(() => window.location.search);
  check(/hold=sugar\+GRNs|hold=sugar%20GRNs/.test(href) && /gain=0\.8/.test(href) && /rate=150/.test(href), `copy link writes the state to the URL (${href})`);
  // synonym search: a literature name resolves to the dataset's own type, marked with the alias
  await p2.getByLabel("cell type search").fill("giant fiber");
  await p2.waitForTimeout(300);
  const opt = await p2.getByRole("listbox").getByRole("option").first().innerText().catch(() => "");
  check(/GF/.test(opt) && /a\.k\.a\. giant fiber/i.test(opt), `synonym search resolves 'giant fiber' → ${opt.split("\n")[0]}`);
  await p2.close();
}

// /limits: the "what this model cannot do" page (ROADMAP item 59) lists every limit with a task link
{
  const p3 = await b.newPage({ viewport: { width: 400, height: 800 } });
  p3.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  await p3.goto(`${URL}/limits`, { waitUntil: "networkidle" });
  check((await p3.locator("h1").innerText()).includes("cannot do"), "/limits: headline");
  check((await p3.locator("ol > li").count()) === 8, "/limits: eight limits");
  check((await p3.evaluate(() => document.documentElement.scrollWidth)) <= 400, "/limits @400px: no horizontal overflow");
  await p3.close();
}

await b.close();
