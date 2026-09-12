// Re-verify an existing profile: N fresh sessions, each reads a page that only
// exists when logged in. The profile already holds the human's login.
import { scrape, interact, stop, log, pause } from "./fc.mjs";
const PROFILE = process.argv[2];
const N = Number(process.argv[3] || 3);
const NEUTRAL = "https://example.com";
const SECURE = "https://the-internet.herokuapp.com/secure";
const CHECK = `
const jar = await page.context().cookies('https://the-internet.herokuapp.com');
const restored = jar.some(c => c.name === 'rack.session');
await page.goto(${JSON.stringify(SECURE)}, { waitUntil: 'domcontentloaded' });
const heading = await page.evaluate(() => (document.querySelector('h2')?.innerText || '').trim());
const loggedIn = await page.evaluate(() => !!document.querySelector('a[href="/logout"]'));
JSON.stringify({ restoredBeforeNav: restored, url: page.url(), loggedIn, heading });
`;
const parse = (r) => { try { return JSON.parse(r); } catch { return { _raw: String(r).slice(0,120) }; } };
let pass = 0;
for (let n = 1; n <= N; n++) {
  const s = await scrape(NEUTRAL, { profileName: PROFILE, saveChanges: false });
  if (!s.scrapeId) { log(`  ${n}: scrape failed HTTP ${s.status}`); continue; }
  const r = await interact(s.scrapeId, { code: CHECK }, 90);
  await stop(s.scrapeId);
  const o = parse(r.result);
  const ok = o.loggedIn === true && o.heading === "Secure Area";
  if (ok) pass++;
  log(`  run ${n}: ${ok ? "PASS" : "FAIL"} exit=${r.exitCode} ${JSON.stringify(o)}`);
  if (r.stderr) log(`         stderr: ${String(r.stderr).slice(0,200)}`);
  if (n < N) await pause(12000);
}
log(`\n  ${pass}/${N} fresh sessions read the protected page`);
