import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { recomputeCaseStatus } from "./lib/status";

/**
 * The board. One reactive query drives the whole screen, so when an email
 * lands the webhook writes a row and every open board moves by itself.
 *
 * It returns three things together — the cases, what is waiting on a human,
 * and the live feed — because they all change on the same event and one
 * subscription is cheaper and simpler than three.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const cases = await ctx.db
      .query("cases")
      .withIndex("by_lastMovedAt")
      .order("desc")
      .take(50);

    const withDetail = await Promise.all(
      cases.map(async (c) => {
        const [tracks, evidence] = await Promise.all([
          ctx.db
            .query("tracks")
            .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
            .take(12),
          ctx.db
            .query("evidence")
            .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
            .order("desc")
            .take(6),
        ]);

        const files = await Promise.all(
          evidence.map(async (e) => ({
            _id: e._id,
            kind: e.kind,
            name: e.locator ?? "file",
            at: e.at,
            url: e.storageId ? await ctx.storage.getUrl(e.storageId) : null,
          })),
        );

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
          evidence: files,
        };
      }),
    );

    // Waiting on you is asks AND held drafts. A letter the agent has written
    // but will not send is waiting on a person just as much as a question is,
    // and it is the more consequential of the two.
    const [openAsks, heldDrafts] = await Promise.all([
      ctx.db
        .query("asks")
        .withIndex("by_state", (q) => q.eq("state", "open"))
        .order("desc")
        .take(10),
      ctx.db
        .query("drafts")
        .withIndex("by_state", (q) => q.eq("state", "held"))
        .order("desc")
        .take(10),
    ]);

    const askRows = await Promise.all(
      openAsks.map(async (a) => {
        const c = await ctx.db.get("cases", a.caseId);
        return {
          _id: a._id as string,
          caseId: a.caseId,
          caseTitle: c?.title ?? "Unknown case",
          kind: a.kind as string,
          question: a.question,
          why: a.why,
          askedAt: a.askedAt,
          remindersSent: a.remindersSent,
          sendsTo: undefined as string | undefined,
        };
      }),
    );

    const draftRows = await Promise.all(
      heldDrafts.map(async (d) => {
        const c = await ctx.db.get("cases", d.caseId);
        return {
          _id: d._id as string,
          caseId: d.caseId,
          caseTitle: c?.title ?? "Unknown case",
          kind: "approve" as string,
          question: `Approve the ${d.purpose} before I send it`,
          why: d.subject,
          askedAt: d.createdAt,
          remindersSent: 0,
          sendsTo: d.to.join(", ") as string | undefined,
        };
      }),
    );

    const waiting = [...draftRows, ...askRows].sort((a, b) => b.askedAt - a.askedAt);

    const feed = await ctx.db.query("events").withIndex("by_at").order("desc").take(25);

    return {
      cases: withDetail,
      waiting,
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

    const [tracks, messages, events, evidence] = await Promise.all([
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
      ctx.db
        .query("evidence")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .order("desc")
        .take(20),
    ]);

    return { case: c, tracks, messages, events, evidence };
  },
});

/**
 * Recompute a case's status from its rows. Status is derived data, so it can
 * drift if a write path ever forgets to update it — this is the repair.
 */
export const resync = internalMutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => recomputeCaseStatus(ctx, args.caseId),
});

/**
 * Delete a case and everything hanging off it. Used to clear rows created by a
 * bug before the guard existed — a verification code and a bounce notice each
 * opened a case that was never a claim.
 */
export const purge = internalMutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const tables = ["tracks", "asks", "drafts", "handoffs", "evidence", "events", "messages", "threads", "caseMembers", "signups", "browserSessions"] as const;
    let removed = 0;
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .take(200);
      for (const r of rows) {
        await ctx.db.delete(table, r._id);
        removed++;
      }
    }
    await ctx.db.delete("cases", args.caseId);
    return removed;
  },
});
