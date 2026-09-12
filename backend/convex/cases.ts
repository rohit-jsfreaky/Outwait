import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * The board. One reactive query drives the whole screen, so when an email
 * lands the webhook writes a row and every open board moves by itself.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_lastMovedAt")
      .order("desc")
      .take(50);

    const withTracks = await Promise.all(
      cases.map(async (c) => {
        const tracks = await ctx.db
          .query("tracks")
          .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
          .take(12);
        return {
          _id: c._id,
          title: c.title,
          company: c.company,
          amount: c.amount,
          currency: c.currency,
          reference: c.reference,
          status: c.status,
          summary: c.summary,
          lastMovedAt: c.lastMovedAt,
          tracks: tracks.map((t) => ({
            _id: t._id,
            kind: t.kind,
            label: t.label,
            state: t.state,
            detail: t.detail,
          })),
        };
      }),
    );

    // The live feed. Same query, so one subscription covers both.
    const feed = await ctx.db.query("events").withIndex("by_at").order("desc").take(25);

    return {
      cases: withTracks,
      feed: feed.map((e) => ({
        _id: e._id,
        caseId: e.caseId,
        type: e.type,
        text: e.text,
        at: e.at,
      })),
    };
  },
});

export const get = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) return null;

    const [tracks, messages, events] = await Promise.all([
      ctx.db
        .query("tracks")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .take(20),
      ctx.db
        .query("messages")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .order("desc")
        .take(30),
      ctx.db
        .query("events")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .order("desc")
        .take(40),
    ]);

    return { case: c, tracks, messages, events };
  },
});
