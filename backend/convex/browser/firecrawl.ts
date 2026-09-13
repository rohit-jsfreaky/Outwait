/**
 * The Firecrawl surface this app uses.
 *
 * Everything here was measured in Phase 1 (`backend/experiments/`), and the
 * numbers below are facts from that run, not assumptions:
 *
 *   - a session is 10 min TTL / 5 min idle, hard. A live-view URL dies with it,
 *     which is why a session is created ON TAP and never held open waiting.
 *   - the profile write is ASYNCHRONOUS. Stop a session and read the profile
 *     back immediately and you get an empty profile. Measured 0/2 with no wait,
 *     3/3 with 45s. 45s was still marginal, so PROFILE_SETTLE_MS is 60s.
 *   - the free plan allows 25 requests/minute and 2 concurrent browsers.
 *   - `code` costs 2 credits/browser-minute, `prompt` costs 7. Everything the
 *     demo depends on uses `code`, so a rerun gives the same result.
 */

const BASE = "https://api.firecrawl.dev/v2";

export const SESSION_TTL_MS = 10 * 60 * 1000;
export const PROFILE_SETTLE_MS = 60 * 1000;

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set on this deployment");
  return key;
}

async function call(method: string, path: string, body?: unknown, attempt = 0): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }

  // 429 looks exactly like a failed interaction if you do not watch for it.
  if (res.status === 429 && attempt < 4) {
    const m = /retry after (\d+)s/i.exec(json?.error ?? "");
    const waitMs = (m ? Number(m[1]) + 2 : 15) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    return call(method, path, body, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Firecrawl ${method} ${path}: ${res.status} ${JSON.stringify(json).slice(0, 250)}`);
  }
  return json;
}

/**
 * Open a browser bound to a named profile. `profile` goes on the SCRAPE and
 * never on the interact call — the interact session inherits it.
 */
export async function startSession(
  url: string,
  profileName: string,
  saveChanges: boolean,
): Promise<string> {
  const json = await call("POST", "/scrape", {
    url,
    formats: ["markdown"],
    profile: { name: profileName, saveChanges },
  });
  const scrapeId = json?.data?.metadata?.scrapeId;
  if (!scrapeId) throw new Error("Firecrawl returned no scrapeId");
  return scrapeId;
}

export type InteractResult = {
  result?: unknown;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  liveViewUrl?: string;
  interactiveLiveViewUrl?: string;
  cdpUrl?: string;
};

/** Deterministic Playwright, not a model prompt. */
export async function act(
  scrapeId: string,
  code: string,
  timeout = 120,
): Promise<InteractResult> {
  return (await call("POST", `/scrape/${scrapeId}/interact`, { code, timeout })) as InteractResult;
}

/** Stopping is what writes a writable profile back. Never leak a session. */
export async function stopSession(scrapeId: string): Promise<void> {
  await call("DELETE", `/scrape/${scrapeId}/interact`);
}

/** The sandbox coerces return values with String(), so code returns JSON text. */
export function parseResult<T>(result: unknown): T | null {
  if (typeof result !== "string") return (result as T) ?? null;
  try {
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}
