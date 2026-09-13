import { v } from "convex/values";
import { mutation, query, internalMutation, internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendMessage } from "./mail/client";
import { startSession, act, stopSession, parseResult, SESSION_TTL_MS } from "./browser/firecrawl";

/**
 * BOUNDARY 3 — the agent hands over the wheel.
 *
 * When a step needs an account that IS the user's, the agent does not ask for
 * the password. It writes a handoff row, emails a one-tap link, and stops.
 *
 * The session is created ON TAP and never before. This is not a style choice —
 * Phase 1 measured it. A Firecrawl session is 10 minutes, hard, and a live-view
 * URL dies with its session. If the session were opened when the email was
 * sent, anyone who taps the link an hour later would land on an Unauthorized
 * error. We saw exactly that happen.
 */

const HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function token(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const byToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const h = await ctx.db
      .query("handoffs")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!h) return null;

    const c = await ctx.db.get("cases", h.caseId);
    const session = h.sessionId ? await ctx.db.get("browserSessions", h.sessionId) : null;

    return {
      _id: h._id,
      reason: h.reason,
      targetUrl: h.targetUrl,
      state: h.state,
      expired: h.expiresAt < Date.now(),
      caseTitle: c?.title ?? "case",
      company: c?.company.name,
      session: session
        ? {
            state: session.state,
            interactiveLiveViewUrl: session.interactiveLiveViewUrl,
            liveViewUrl: session.liveViewUrl,
            expiresAt: session.expiresAt,
          }
        : null,
    };
  },
});

export const request = mutation({
  args: {
    caseId: v.id("cases"),
    reason: v.string(),
    targetUrl: v.string(),
    profileName: v.string(),
    blockTrackId: v.optional(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const handoffId = await ctx.db.insert("handoffs", {
      caseId: args.caseId,
      token: token(),
      reason: args.reason,
      targetUrl: args.targetUrl,
      profileName: args.profileName,
      state: "pending",
      expiresAt: now + HANDOFF_TTL_MS,
    });

    if (args.blockTrackId) {
      await ctx.db.patch("tracks", args.blockTrackId, {
        state: "blocked",
        detail: args.reason,
        lastMovedAt: now,
      });
    }

    await ctx.db.patch("cases", args.caseId, { status: "waiting_on_you", lastMovedAt: now });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "handoff.requested",
      text: `${args.reason} — sending you a one-tap link. No password ever comes to me.`,
      at: now,
    });

    await ctx.scheduler.runAfter(0, internal.handoffs.emailLink, { handoffId });
    return handoffId;
  },
});

export const loadForEmail = internalMutation({
  args: { handoffId: v.id("handoffs") },
  handler: async (ctx, args) => {
    const h = await ctx.db.get("handoffs", args.handoffId);
    if (!h) return null;
    const c = await ctx.db.get("cases", h.caseId);
    if (!c?.ownerEmail) return null;
    return { to: c.ownerEmail, caseTitle: c.title, reason: h.reason, token: h.token };
  },
});

export const emailLink = internalAction({
  args: { handoffId: v.id("handoffs") },
  handler: async (ctx, args) => {
    const h = await ctx.runMutation(internal.handoffs.loadForEmail, { handoffId: args.handoffId });
    if (!h) return null;

    const site = process.env.CONVEX_SITE_URL ?? "";
    const link = `${site}/handover/${h.token}`;

    await sendMessage({
      to: [h.to],
      subject: `${h.caseTitle} — 20 seconds, when you have them`,
      text: [
        h.reason,
        "",
        "I cannot do this bit. It needs your login, and I am not asking you for your password.",
        "",
        `Tap this when you have a minute and a browser opens with the form already filled in. You type the password, I carry on:`,
        link,
        "",
        "The browser only starts when you tap, so there is nothing sitting open waiting.",
      ].join("\n"),
      labels: ["handoff"],
    });

    await ctx.runMutation(internal.handoffs.noteEmailed, { handoffId: args.handoffId });
    return null;
  },
});

export const noteEmailed = internalMutation({
  args: { handoffId: v.id("handoffs") },
  handler: async (ctx, args) => {
    const h = await ctx.db.get("handoffs", args.handoffId);
    if (!h) return null;
    await ctx.db.insert("events", {
      caseId: h.caseId,
      type: "handoff.sent",
      text: "One-tap link is in your email. Nothing is open until you tap it.",
      at: Date.now(),
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// ON TAP. Everything below runs because a person clicked, not before.
// ---------------------------------------------------------------------------

export const markOpening = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const h = await ctx.db
      .query("handoffs")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!h) return null;
    if (h.expiresAt < Date.now()) {
      await ctx.db.patch("handoffs", h._id, { state: "expired" });
      return null;
    }
    return { handoffId: h._id, caseId: h.caseId, targetUrl: h.targetUrl, profileName: h.profileName };
  },
});

export const recordSession = internalMutation({
  args: {
    handoffId: v.id("handoffs"),
    caseId: v.id("cases"),
    scrapeId: v.string(),
    profileName: v.string(),
    liveViewUrl: v.optional(v.string()),
    interactiveLiveViewUrl: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("browserSessions", {
      caseId: args.caseId,
      handoffId: args.handoffId,
      scrapeId: args.scrapeId,
      profileName: args.profileName,
      liveViewUrl: args.liveViewUrl,
      interactiveLiveViewUrl: args.interactiveLiveViewUrl,
      state: "live",
      startedAt: Date.now(),
      expiresAt: args.expiresAt,
    });
    await ctx.db.patch("handoffs", args.handoffId, { state: "open", sessionId });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "handoff.opened",
      text: "You tapped the link. The browser is open and it is yours to type in.",
      at: Date.now(),
    });
    return sessionId;
  },
});

/** Creates the Firecrawl session. Called only from the handover page. */
export const open = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const h = await ctx.runMutation(internal.handoffs.markOpening, { token: args.token });
    if (!h) return { ok: false as const, reason: "That link has expired." };

    const scrapeId = await startSession(h.targetUrl, h.profileName, true);
    const opened = await act(
      scrapeId,
      `await page.goto(${JSON.stringify(h.targetUrl)}, { waitUntil: 'networkidle' });
JSON.stringify({ url: page.url() });`,
      90,
    );

    if (!opened.interactiveLiveViewUrl) {
      await stopSession(scrapeId).catch(() => {});
      return { ok: false as const, reason: "The browser did not start. Try the link again." };
    }

    await ctx.runMutation(internal.handoffs.recordSession, {
      handoffId: h.handoffId,
      caseId: h.caseId,
      scrapeId,
      profileName: h.profileName,
      liveViewUrl: opened.liveViewUrl,
      interactiveLiveViewUrl: opened.interactiveLiveViewUrl,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    return {
      ok: true as const,
      interactiveLiveViewUrl: opened.interactiveLiveViewUrl,
      liveViewUrl: opened.liveViewUrl,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
  },
});

export const finishData = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const h = await ctx.db
      .query("handoffs")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!h?.sessionId) return null;
    const s = await ctx.db.get("browserSessions", h.sessionId);
    if (!s || s.state !== "live") return null;
    return { handoffId: h._id, caseId: h.caseId, sessionId: s._id, scrapeId: s.scrapeId };
  },
});

/**
 * The human says they are done. The agent checks the page itself, then stops
 * the session — and stopping is what writes the login into the profile.
 */
export const finish = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const d = await ctx.runMutation(internal.handoffs.finishData, { token: args.token });
    if (!d) return { ok: false as const, reason: "Nothing open to finish." };

    let landedOn = "";
    try {
      const check = await act(
        d.scrapeId,
        `JSON.stringify({ url: page.url(), title: await page.title() });`,
        45,
      );
      const parsed = parseResult<{ url: string; title: string }>(check.result);
      landedOn = parsed?.url ?? "";
    } catch {
      // The session may already have timed out. Stopping still saves state.
    }

    await stopSession(d.scrapeId).catch(() => {});
    await ctx.runMutation(internal.handoffs.markDone, {
      handoffId: d.handoffId,
      caseId: d.caseId,
      sessionId: d.sessionId,
      landedOn,
    });
    return { ok: true as const };
  },
});

export const markDone = internalMutation({
  args: {
    handoffId: v.id("handoffs"),
    caseId: v.id("cases"),
    sessionId: v.id("browserSessions"),
    landedOn: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch("browserSessions", args.sessionId, { state: "stopped", stoppedAt: now });
    await ctx.db.patch("handoffs", args.handoffId, { state: "done", usedAt: now });

    const blocked = await ctx.db
      .query("tracks")
      .withIndex("by_caseId_and_state", (q) => q.eq("caseId", args.caseId).eq("state", "blocked"))
      .take(10);
    for (const t of blocked) {
      if (!t.blockedOnAskId) {
        await ctx.db.patch("tracks", t._id, {
          state: "running",
          detail: "You logged in. I have the session now.",
          lastMovedAt: now,
        });
      }
    }

    await ctx.db.patch("cases", args.caseId, { status: "working", lastMovedAt: now });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "handoff.done",
      text: "Login saved to this company's profile. I will not need to ask again.",
      at: now,
    });
    return null;
  },
});
