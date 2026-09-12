// PHASE 1 / reliability harness.
//
// Earlier one-off runs disagreed: identical plain cookies survived in one run
// and vanished in another. That is the thing to pin down — a flaky profile is
// worse than one that never works, because it fails on camera.
//
// Each round: fresh profile -> write cookie + localStorage -> stop -> optional
// wait -> new scrape, same profile -> read back. Reports a success rate.
//
//   node --env-file=.env q2-repeat.mjs <rounds> <waitMs>

import { scrape, interact, stop, log } from "./fc.mjs";

const ROUNDS = Number(process.argv[2] || 3);
const WAIT_MS = Number(process.argv[3] || 0);
const FIXED = process.argv[4] || null; // reuse ONE profile across rounds
const URL = "https://example.com";

const WRITE = `
await page.context().addCookies([
  { name: 'ow_ck', value: 'V1', domain: 'example.com', path: '/',
    expires: Math.floor(Date.now()/1000) + 86400 },
]);
await page.evaluate(() => localStorage.setItem('ow_ls', 'V1'));
const c = await page.context().cookies();
JSON.stringify({
  cookieSet: c.some(x => x.name === 'ow_ck'),
  lsSet: await page.evaluate(() => localStorage.getItem('ow_ls')),
});
`;

const READ = `
const c = await page.context().cookies();
JSON.stringify({
  cookie: c.some(x => x.name === 'ow_ck'),
  ls: await page.evaluate(() => localStorage.getItem('ow_ls')),
  names: c.map(x => x.name),
});
`;

function parse(r) {
  if (r === undefined || r === null) return { _bad: "no result" };
  if (typeof r === "object") return r;
  try { return JSON.parse(r); } catch { return { _bad: String(r).slice(0, 160) }; }
}

async function session(profileName, saveChanges, code) {
  const s = await scrape(URL, { profileName, saveChanges });
  if (!s.scrapeId) return { err: `scrape HTTP ${s.status} ${JSON.stringify(s.error ?? "").slice(0, 120)}` };
  const i = await interact(s.scrapeId, { code }, 60);
  const d = await stop(s.scrapeId);
  return {
    out: parse(i.result),
    exitCode: i.exitCode,
    stderr: i.stderr ? String(i.stderr).slice(0, 200) : "",
    stopStatus: d.status,
    interactStatus: i.status,
  };
}

log(`rounds=${ROUNDS}  waitAfterStop=${WAIT_MS}ms\n`);
let pass = 0;

for (let n = 1; n <= ROUNDS; n++) {
  const profile = FIXED || `outwait-rep-${Date.now()}-${n}`;
  const w = await session(profile, true, WRITE);
  if (w.err) { log(`round ${n}: WRITE ${w.err}`); continue; }

  if (WAIT_MS) await new Promise((r) => setTimeout(r, WAIT_MS));

  const r = await session(profile, false, READ);
  if (r.err) { log(`round ${n}: READ ${r.err}`); continue; }

  const ok = r.out?.cookie === true && r.out?.ls === "V1";
  if (ok) pass++;

  log(
    `round ${n}: ${ok ? "PASS" : "FAIL"}  ` +
      `write(exit=${w.exitCode} ${JSON.stringify(w.out)})  ` +
      `read(exit=${r.exitCode} cookie=${r.out?.cookie} ls=${r.out?.ls})`
  );
  if (r.out?._bad) log(`          read raw: ${r.out._bad}`);
  if (r.stderr) log(`          read stderr: ${r.stderr}`);
  if (r.out?.names) log(`          cookies seen: ${r.out.names.join(", ") || "(none)"}`);
}

log(`\n================ RELIABILITY ================`);
log(`  ${pass}/${ROUNDS} rounds persisted state  (wait after stop: ${WAIT_MS}ms)`);
