import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/**
 * BOUNDARY 1 — the agent reads its OWN verification code.
 *
 * When a step needs an account that does not belong to the user — a complaints
 * portal, an ombudsman, a claims registry — the agent registers itself with its
 * own address. The code arrives in its own inbox, it reads it, and the human is
 * never involved.
 *
 * Two things make this safe rather than clever:
 *
 *   1. The code is extracted by a REGEX, not by a model. A model asked to "find
 *      the code" in a hostile email can be talked into returning something else.
 *      A 4-8 digit run near the word code/OTP/verify cannot be argued with.
 *   2. It only looks for a code at all while a signup is genuinely open. With
 *      no signup in flight, a mail full of digits is just a new case.
 */

/** Anchored on the words a verification mail actually uses. */
export function extractCode(text: string): string | null {
  if (!text) return null;
  const haystack = text.slice(0, 4000);

  // The gap between the anchor word and the digits must allow ordinary words —
  // "your code is 482913", "PIN to continue: 55219". Excluding letters looked
  // tighter but missed most real verification emails. The distance cap is what
  // keeps it honest, not the character class.
  const anchored = [
    /\b(?:code|otp|pin|passcode)\b[^0-9]{0,40}?([0-9]{4,8})\b/i,
    /\b([0-9]{4,8})\b[^0-9]{0,30}?\bis your\b/i,
    /\bverif\w*[^0-9]{0,40}?([0-9]{4,8})\b/i,
    // "Use 550132 to confirm your email address."
    /\b([0-9]{4,8})\b[^0-9]{0,30}?\bto (?:confirm|verify|activate|complete)\b/i,
  ];
  for (const re of anchored) {
    const m = re.exec(haystack);
    if (m) return m[1];
  }

  // A lone digit run on its own line is the other common shape.
  const standalone = /(?:^|\n)[ \t]*([0-9]{4,8})[ \t]*(?:\n|$)/.exec(haystack);
  return standalone ? standalone[1] : null;
}

export const openSignup = internalQuery({
  args: {},
  handler: async (ctx) => {
    const waiting = await ctx.db
      .query("signups")
      .withIndex("by_state", (q) => q.eq("state", "awaiting_code"))
      .order("desc")
      .take(1);
    return waiting[0] ?? null;
  },
});

export const recordCode = internalMutation({
  args: { signupId: v.id("signups"), code: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db.get("signups", args.signupId);
    if (!s || s.state !== "awaiting_code") return null;

    await ctx.db.patch("signups", args.signupId, { code: args.code, state: "verified" });
    await ctx.db.insert("events", {
      caseId: s.caseId,
      type: "otp.read",
      text: `${s.site} emailed a code to my own address. I read it myself — you were not involved.`,
      at: Date.now(),
    });
    return null;
  },
});

export const startSignup = internalMutation({
  args: { caseId: v.id("cases"), site: v.string(), profileName: v.string() },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("signups", {
      caseId: args.caseId,
      site: args.site,
      profileName: args.profileName,
      state: "registering",
      startedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "signup.started",
      text: `${args.site} needs an account. Making one in my own name, not yours.`,
      at: Date.now(),
    });
    return id;
  },
});

export const awaitCode = internalMutation({
  args: { signupId: v.id("signups"), scrapeId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await ctx.db.get("signups", args.signupId);
    if (!s) return null;
    await ctx.db.patch("signups", args.signupId, {
      state: "awaiting_code",
      scrapeId: args.scrapeId,
    });
    await ctx.db.insert("events", {
      caseId: s.caseId,
      type: "signup.awaiting_code",
      text: `Signed up at ${s.site} with my own address. Waiting for their code.`,
      at: Date.now(),
    });
    return null;
  },
});

export const failSignup = internalMutation({
  args: { signupId: v.id("signups"), reason: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db.get("signups", args.signupId);
    if (!s) return null;
    await ctx.db.patch("signups", args.signupId, { state: "failed" });
    await ctx.db.insert("events", {
      caseId: s.caseId,
      type: "signup.failed",
      text: `Could not register at ${s.site}: ${args.reason}`,
      at: Date.now(),
    });
    return null;
  },
});

export const getSignup = internalQuery({
  args: { signupId: v.id("signups") },
  handler: async (ctx, args) => ctx.db.get("signups", args.signupId),
});

/** The code went in and the agent is through. Its own account, its own code. */
export const finishSignup = internalMutation({
  args: { signupId: v.id("signups"), landedOn: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db.get("signups", args.signupId);
    if (!s) return null;
    await ctx.db.insert("events", {
      caseId: s.caseId,
      type: "signup.done",
      text: `Registered at ${s.site} in my own name. No human touched it.`,
      at: Date.now(),
    });
    return null;
  },
});

/** Drop a signup row that never completed, so the trail reads true. */
export const dropSignup = internalMutation({
  args: { signupId: v.id("signups") },
  handler: async (ctx, args) => {
    await ctx.db.delete("signups", args.signupId);
    return null;
  },
});
