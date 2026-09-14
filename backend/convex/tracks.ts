import { v } from "convex/values";
import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { trackKind, trackState } from "./schema";
import { recomputeCaseStatus } from "./lib/status";

/**
 * A case is many tracks, not one line (DESIGN.md section 5).
 *
 * This is what stops the agent sitting idle when it is blocked. One track waits
 * on a human; the others carry on. That is the whole reason the product can
 * claim to outlast anybody — it is never fully stopped.
 *
 * The state machine is deterministic. No model decides what happens next.
 */

/** Legal moves. Anything not listed here is a bug, not a judgement call. */
const ALLOWED: Record<string, string[]> = {
  ready: ["running", "blocked", "abandoned"],
  running: ["done", "blocked", "abandoned"],
  blocked: ["running", "ready", "abandoned"],
  done: [],
  abandoned: ["ready"],
};

export const listForCase = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) =>
    ctx.db
      .query("tracks")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20),
});

export const move = internalMutation({
  args: {
    trackId: v.id("tracks"),
    to: trackState,
    detail: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const t = await ctx.db.get("tracks", args.trackId);
    if (!t) return null;

    if (t.state === args.to) {
      // Same state, new detail. Still counts as movement worth showing.
      await ctx.db.patch("tracks", args.trackId, {
        detail: args.detail ?? t.detail,
        lastMovedAt: Date.now(),
      });
      return null;
    }

    if (!ALLOWED[t.state]?.includes(args.to)) {
      throw new Error(`illegal track move: ${t.state} -> ${args.to}`);
    }

    await ctx.db.patch("tracks", args.trackId, {
      state: args.to,
      detail: args.detail ?? t.detail,
      blockedOnAskId: args.to === "blocked" ? t.blockedOnAskId : undefined,
      lastMovedAt: Date.now(),
    });

    if (args.note) {
      await ctx.db.insert("events", {
        caseId: t.caseId,
        type: `track.${args.to}`,
        text: args.note,
        at: Date.now(),
      });
    }

    await recomputeCaseStatus(ctx, t.caseId);
    return null;
  },
});

export const add = mutation({
  args: {
    caseId: v.id("cases"),
    kind: trackKind,
    label: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("tracks", {
      caseId: args.caseId,
      kind: args.kind,
      label: args.label,
      state: "ready",
      detail: args.detail,
      lastMovedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "track.opened",
      text: `New track: ${args.label}`,
      at: Date.now(),
    });
    return id;
  },
});

/**
 * The route-around order, from DESIGN.md section 5. Asking a human is the LAST
 * option, never the first:
 *
 *   1. can this be done by email?            -> no login needed at all
 *   2. can the agent do it with its own account?  -> boundary 1
 *   3. only then, ask the human              -> boundary 3
 *
 * Deliberately a pure function so the order cannot drift.
 */
export function routeAround(need: {
  emailPossible: boolean;
  agentCanRegister: boolean;
}): "email" | "own_account" | "ask_human" {
  if (need.emailPossible) return "email";
  if (need.agentCanRegister) return "own_account";
  return "ask_human";
}

export const noteRouteAround = internalMutation({
  args: {
    caseId: v.id("cases"),
    trackId: v.id("tracks"),
    chose: v.string(),
    because: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "track.routed",
      text: `${args.because} — going the ${args.chose} route instead of asking you.`,
      at: Date.now(),
    });
    return null;
  },
});

/**
 * Cancel a request for a human when the agent found another way. The product
 * promise from DESIGN.md is that it says so out loud: "do not bother with that
 * link, email worked."
 */
export const standDown = internalMutation({
  args: { caseId: v.id("cases"), reason: v.string() },
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("asks")
      .withIndex("by_caseId_and_state", (q) => q.eq("caseId", args.caseId).eq("state", "open"))
      .take(5);
    for (const a of open) {
      await ctx.db.patch("asks", a._id, { state: "cancelled" });
    }

    const handoffs = await ctx.db
      .query("handoffs")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(10);
    for (const h of handoffs) {
      if (h.state === "pending") await ctx.db.patch("handoffs", h._id, { state: "expired" });
    }

    if (open.length > 0 || handoffs.some((h) => h.state === "pending")) {
      await ctx.db.insert("events", {
        caseId: args.caseId,
        type: "ask.cancelled",
        text: `Do not bother with that — ${args.reason}`,
        at: Date.now(),
      });
    }
    await recomputeCaseStatus(ctx, args.caseId);
    return null;
  },
});
