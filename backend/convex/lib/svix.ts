/**
 * Svix webhook signature verification, implemented against the published spec
 * at docs.svix.com/receiving/verifying-payloads/how-manual.
 *
 * Written by hand rather than pulling in the `svix` package because HTTP
 * actions run in Convex's own runtime, not Node, and Web Crypto is already
 * there. Correctness is pinned by the test vector Svix publishes — see
 * `convex/lib/svix.test.ts`.
 *
 * The scheme:
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *   signature      = base64( HMAC-SHA256( base64decode(secret after "whsec_"),
 *                                         signed content ) )
 * and `svix-signature` carries a space-delimited list of `v1,<sig>` entries,
 * any one of which may match.
 */

/** Reject anything older than this, to stop replay of a captured delivery. */
const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

/** Length-independent compare, so a mismatch leaks no timing signal. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function computeSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  body: string,
): Promise<string> {
  // A secret may arrive with or without the `whsec_` prefix.
  const rawSecret = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(rawSecret) as unknown as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  return bytesToBase64(sig);
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a webhook delivery. `body` must be the exact raw request text —
 * re-serialising parsed JSON changes the bytes and the signature will not match.
 */
export async function verifySvix(
  secret: string,
  headers: Headers,
  body: string,
  now: number = Date.now(),
): Promise<VerifyResult> {
  // Svix white-labels the prefix to `webhook-` on some plans; accept both.
  const svixId = headers.get("svix-id") ?? headers.get("webhook-id");
  const svixTimestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const svixSignature = headers.get("svix-signature") ?? headers.get("webhook-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "missing svix headers" };
  }

  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const ageSeconds = Math.abs(now / 1000 - ts);
  if (ageSeconds > TOLERANCE_SECONDS) {
    return { ok: false, reason: `timestamp outside tolerance (${Math.round(ageSeconds)}s)` };
  }

  const expected = await computeSignature(secret, svixId, svixTimestamp, body);

  // The header is a space-delimited list; any entry may match.
  for (const entry of svixSignature.split(" ")) {
    const comma = entry.indexOf(",");
    if (comma === -1) continue;
    const candidate = entry.slice(comma + 1);
    if (timingSafeEqual(candidate, expected)) return { ok: true };
  }
  return { ok: false, reason: "no matching signature" };
}
