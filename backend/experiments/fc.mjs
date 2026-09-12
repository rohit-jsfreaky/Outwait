// Thin Firecrawl v2 client for Phase 1 experiments.
// The API key is read from process.env (node --env-file=.env) and never printed.
//
// The free plan allows 25 requests/minute. Exceeding it returns 429 with a
// "please retry after Ns" message, and a 429 on interact looks exactly like a
// failed interaction if you are not watching for it. Retry here so experiments
// measure the browser, not the rate limiter.

const KEY = process.env.FIRECRAWL_API_KEY;
if (!KEY) throw new Error("FIRECRAWL_API_KEY missing — run with: node --env-file=.env");

const BASE = "https://api.firecrawl.dev/v2";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let verbose = process.env.FC_VERBOSE === "1";

async function call(method, path, body, attempt = 0) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }

  if (res.status === 429 && attempt < 6) {
    const m = /retry after (\d+)s/i.exec(json?.error || "");
    const waitMs = (m ? Number(m[1]) + 2 : 15) * 1000;
    if (verbose) console.log(`   [429] waiting ${waitMs / 1000}s then retrying ${method} ${path}`);
    await sleep(waitMs);
    return call(method, path, body, attempt + 1);
  }
  return { status: res.status, json };
}

/** Scrape a URL, optionally binding a persistent profile. Returns scrapeId. */
export async function scrape(url, { profileName, saveChanges, formats = ["markdown"] } = {}) {
  const body = { url, formats };
  if (profileName) body.profile = { name: profileName, saveChanges: !!saveChanges };
  const t0 = Date.now();
  const { status, json } = await call("POST", "/scrape", body);
  return {
    status,
    ms: Date.now() - t0,
    scrapeId: json?.data?.metadata?.scrapeId,
    error: json?.error,
    json,
  };
}

/** Run code (2 credits/min) or a prompt (7 credits/min) in the live session. */
export async function interact(scrapeId, payload, timeout = 60) {
  const t0 = Date.now();
  const { status, json } = await call("POST", `/scrape/${scrapeId}/interact`, { ...payload, timeout });
  return { status, ms: Date.now() - t0, ...json };
}

/** Stop the session. This is what writes a writable profile back. */
export async function stop(scrapeId) {
  const { status, json } = await call("DELETE", `/scrape/${scrapeId}/interact`);
  return { status, json };
}

export const log = (...a) => console.log(...a);
export const pause = sleep;
