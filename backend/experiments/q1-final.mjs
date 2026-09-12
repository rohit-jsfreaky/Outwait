// PHASE 1 FINISH LINE — the whole mechanic, end to end, in one run.
//
//   1. open a session on a login page with a fresh writable profile
//   2. embed interactiveLiveViewUrl (+ read-only liveViewUrl) in a local page
//   3. a HUMAN types the password into the embedded browser
//   4. the agent notices, carries on, and stops the session (profile is written)
//   5. wait for the async profile write to land
//   6. three fresh sessions read a page that only exists when logged in
//
//   node --env-file=.env q1-final.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrape, interact, stop, log, pause } from "./fc.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = `outwait-handover-${Date.now()}`;
const LOGIN_URL = "https://the-internet.herokuapp.com/login";
const SECURE_URL = "https://the-internet.herokuapp.com/secure";
const NEUTRAL = "https://example.com";
const SETTLE_MS = 45000;

const parse = (r) => { try { return JSON.parse(r); } catch { return { _raw: String(r).slice(0, 160) }; } };

const OPEN = `
await page.goto(${JSON.stringify(LOGIN_URL)}, { waitUntil: 'networkidle' });
JSON.stringify({ url: page.url() });
`;

const POLL = `
JSON.stringify({
  url: page.url(),
  loggedIn: await page.evaluate(() => !!document.querySelector('a[href="/logout"]')),
});
`;

// After the human logs in, the agent does the next step itself — reading a value
// that only exists behind the login. That is the "agent carries on" half.
const AGENT_CONTINUES = `
await page.goto(${JSON.stringify(SECURE_URL)}, { waitUntil: 'networkidle' });
JSON.stringify({
  url: page.url(),
  heading: (await page.evaluate(() => document.querySelector('h2')?.innerText || '')).trim(),
  banner: (await page.evaluate(() => document.querySelector('#flash')?.innerText || '')).trim().slice(0, 40),
});
`;

const CHECK = `
const jar = await page.context().cookies('https://the-internet.herokuapp.com');
const restored = jar.some(c => c.name === 'rack.session');
await page.goto(${JSON.stringify(SECURE_URL)}, { waitUntil: 'networkidle' });
JSON.stringify({
  restoredBeforeNav: restored,
  url: page.url(),
  loggedIn: await page.evaluate(() => !!document.querySelector('a[href="/logout"]')),
  heading: (await page.evaluate(() => document.querySelector('h2')?.innerText || '')).trim(),
});
`;

// ---- 1 & 2: open the session and build the embed page ----
const s = await scrape(LOGIN_URL, { profileName: PROFILE, saveChanges: true });
if (!s.scrapeId) { log(`scrape failed HTTP ${s.status}`); process.exit(1); }

const first = await interact(s.scrapeId, { code: OPEN }, 60);
if (!first.interactiveLiveViewUrl) { log(`no interactive url: ${JSON.stringify(first).slice(0, 300)}`); process.exit(1); }

fs.writeFileSync(path.join(DIR, "session.json"), JSON.stringify({ profile: PROFILE, scrapeId: s.scrapeId }, null, 2));
fs.writeFileSync(path.join(DIR, "handover.html"), `<!doctype html>
<meta charset="utf-8"><title>Outwait — handover</title>
<style>
 body{margin:0;font:14px system-ui;background:#faf9f7;color:#1c1917}
 header{padding:14px 18px;border-bottom:1px solid #e7e5e4;background:#fff}
 h1{margin:0 0 6px;font-size:17px} p{margin:0;color:#57534e}
 b{background:#fef3c7;padding:1px 5px;border-radius:4px}
 .row{display:flex;gap:14px;padding:14px}.col{flex:1;min-width:0}
 .lbl{font-weight:600;margin-bottom:6px;font-size:13px}
 iframe{width:100%;height:600px;border:1px solid #d6d3d1;border-radius:10px;background:#fff}
</style>
<header>
 <h1>Type the login in the LEFT frame</h1>
 <p>Username <b>tomsmith</b> &nbsp; Password <b>SuperSecretPassword!</b> &nbsp; then press Login.</p>
</header>
<div class="row">
 <div class="col"><div class="lbl">Interactive — you can click and type here</div>
  <iframe src="${first.interactiveLiveViewUrl}"></iframe></div>
 <div class="col"><div class="lbl">Read-only — what the other people on the case see</div>
  <iframe src="${first.liveViewUrl}"></iframe></div>
</div>`);

log(`profile : ${PROFILE}`);
log(`page    : ${JSON.stringify(parse(first.result))}`);
log(`\n>>> OPEN http://127.0.0.1:8777/ AND TYPE THE LOGIN <<<`);
log(`    tomsmith / SuperSecretPassword!\n`);

// ---- 3: wait for the human ----
let loggedIn = false;
const t0 = Date.now();
for (let i = 1; i <= 40; i++) {
  await pause(12000);
  const p = await interact(s.scrapeId, { code: POLL }, 30);
  const o = parse(p.result);
  log(`  waiting ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s  loggedIn=${o.loggedIn}  url=${o.url}`);
  if (o.loggedIn === true) { loggedIn = true; break; }
}

if (!loggedIn) { log(`\nno login detected — stopping session`); await stop(s.scrapeId); process.exit(1); }

// ---- 4: the agent takes over ----
log(`\nHUMAN DONE. Agent continues on its own:`);
const cont = await interact(s.scrapeId, { code: AGENT_CONTINUES }, 60);
log(`  ${JSON.stringify(parse(cont.result))}`);

const d = await stop(s.scrapeId);
log(`  session stopped HTTP ${d.status} — profile write begins`);

// ---- 5 & 6: settle, then prove it three times ----
log(`\nwaiting ${SETTLE_MS / 1000}s for the async profile write`);
await pause(SETTLE_MS);

let pass = 0;
for (let n = 1; n <= 3; n++) {
  const c = await scrape(NEUTRAL, { profileName: PROFILE, saveChanges: false });
  if (!c.scrapeId) { log(`  check ${n}: scrape failed`); continue; }
  const r = await interact(c.scrapeId, { code: CHECK }, 90);
  await stop(c.scrapeId);
  const o = parse(r.result);
  const ok = o.loggedIn === true && o.heading === "Secure Area";
  if (ok) pass++;
  log(`  check ${n}: ${ok ? "PASS" : "FAIL"} ${JSON.stringify(o)}`);
  if (n < 3) await pause(12000);
}

log(`\n================ PHASE 1 FINISH LINE ================`);
log(`  human logged in through the embedded browser : ${loggedIn}`);
log(`  agent continued in the same session          : ${parse(cont.result).heading === "Secure Area"}`);
log(`  protected page read back afterwards          : ${pass}/3`);
log(`  VERDICT : ${loggedIn && pass === 3 ? "PHASE 1 PASSES" : "NOT YET"}`);
