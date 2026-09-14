import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { startSession, act, stopSession, parseResult } from "./firecrawl";
import { INBOX_ID } from "../mail/client";

/**
 * BOUNDARY 1 — the agent acts as itself.
 *
 * When a step needs an account that does NOT belong to the user — a complaints
 * portal, an ombudsman, a claims registry — the agent registers itself with its
 * own address. The verification code lands in its own inbox, it reads it, and
 * the human is never involved.
 *
 * The whole flow is deterministic Playwright. The only "intelligence" is a
 * regex over the incoming mail (`mail/otp.ts`), because a model asked to find a
 * code inside a hostile email can be argued into returning something else.
 */

const POLL_EVERY_MS = 8000;
const MAX_POLLS = 22; // ~3 minutes, comfortably inside the 10 minute session TTL

/** Put the agent's own address into whatever the page uses for email. */
const REQUEST_CODE = (loginUrl: string) => `
await page.goto(${JSON.stringify(loginUrl)}, { waitUntil: 'networkidle' });

const email = page.locator('input[type=email], input[name=email], #email').first();
await email.waitFor({ state: 'visible', timeout: 20000 });
await email.fill(${JSON.stringify(INBOX_ID)});
await page.waitForTimeout(400);

const submit = page.locator('button:has-text("Log in with email"), button:has-text("Continue with email"), button[type=submit]').first();
await submit.click();
await page.waitForTimeout(6000);

JSON.stringify({
  url: page.url(),
  text: (await page.locator('body').innerText()).replace(/\\s+/g, ' ').slice(0, 400),
});
`;

/**
 * Enter the code. Sites use either one field or a row of single-character
 * boxes, so handle both rather than assuming.
 */
const ENTER_CODE = (code: string) => `
const boxes = page.locator('input[maxlength="1"]');
const n = await boxes.count();

if (n >= ${code.length}) {
  for (let i = 0; i < ${code.length}; i++) {
    await boxes.nth(i).fill(${JSON.stringify(code)}[i]);
    await page.waitForTimeout(120);
  }
} else {
  const one = page.locator('input[name*=code i], input[name*=otp i], input[autocomplete="one-time-code"], input[type=text]:visible').first();
  await one.waitFor({ state: 'visible', timeout: 15000 });
  await one.fill(${JSON.stringify(code)});
}

await page.waitForTimeout(600);
const go = page.locator('button[type=submit], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")').first();
if (await go.count()) { await go.click(); }
await page.waitForTimeout(7000);

JSON.stringify({
  url: page.url(),
  text: (await page.locator('body').innerText()).replace(/\\s+/g, ' ').slice(0, 300),
});
`;

export const registerSelf = internalAction({
  args: {
    caseId: v.id("cases"),
    site: v.string(),
    loginUrl: v.string(),
    profileName: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; detail: string }> => {
    const signupId = await ctx.runMutation(internal.mail.otp.startSignup, {
      caseId: args.caseId,
      site: args.site,
      profileName: args.profileName,
    });

    let scrapeId: string | null = null;
    try {
      // saveChanges so the account survives — the point is not to sign up twice.
      scrapeId = await startSession(args.loginUrl, args.profileName, true);

      const asked = await act(scrapeId, REQUEST_CODE(args.loginUrl), 120);
      const askedOut = parseResult<{ url: string; text: string }>(asked.result);

      // Mark awaiting BEFORE the mail can land, or the webhook would read the
      // verification email as a brand new case.
      await ctx.runMutation(internal.mail.otp.awaitCode, { signupId, scrapeId });

      // Wait for the agent's own inbox to receive it. The webhook writes the
      // code onto the signup row; this just watches for it.
      let code: string | null = null;
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
        const row = await ctx.runQuery(internal.mail.otp.getSignup, { signupId });
        if (row?.code) {
          code = row.code;
          break;
        }
        // Cheap keep-alive so the session does not idle out while waiting.
        if (i % 3 === 2) await act(scrapeId, `JSON.stringify({ alive: page.url() });`, 30);
      }

      if (!code) {
        await ctx.runMutation(internal.mail.otp.failSignup, {
          signupId,
          reason: `no code arrived. The page said: ${askedOut?.text?.slice(0, 120) ?? "nothing"}`,
        });
        return { ok: false, detail: "no code arrived" };
      }

      const entered = await act(scrapeId, ENTER_CODE(code), 120);
      const out = parseResult<{ url: string; text: string }>(entered.result);

      await ctx.runMutation(internal.mail.otp.finishSignup, {
        signupId,
        landedOn: out?.url ?? "",
      });
      return { ok: true, detail: out?.url ?? "" };
    } catch (err) {
      await ctx.runMutation(internal.mail.otp.failSignup, {
        signupId,
        reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
      return { ok: false, detail: String(err).slice(0, 200) };
    } finally {
      // Stopping is what writes the profile back. Never leak a session.
      if (scrapeId) await stopSession(scrapeId).catch(() => {});
    }
  },
});
