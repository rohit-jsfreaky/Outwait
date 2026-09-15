import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
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
    // This returns handover tokens, and a handover token is a credential. The
    // board is signed-in only; null rather than a throw so the shell can keep
    // showing its skeleton while auth is still settling.
    if ((await getAuthUserId(ctx)) === null) return null;

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
          // How long this has been going on is the whole point of the product,
          // so the board gets the open date, not just the last movement.
          openedAt: c.openedAt ?? c._creationTime,
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
    // A live handover is waiting on a human just as much as a question is, and
    // it is the one that cannot be answered by replying to an email — somebody
    // has to tap the link. Leaving it out of this list was why a case could
    // read "waiting on you" while the panel underneath said nothing was.
    const [openAsks, heldDrafts, pending, opened] = await Promise.all([
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
      ctx.db
        .query("handoffs")
        .withIndex("by_state", (q) => q.eq("state", "pending"))
        .order("desc")
        .take(10),
      ctx.db
        .query("handoffs")
        .withIndex("by_state", (q) => q.eq("state", "open"))
        .order("desc")
        .take(10),
    ]);

    const liveHandoffs = [...pending, ...opened].filter((h) => h.expiresAt > Date.now());

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
          href: undefined as string | undefined,
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
          href: undefined as string | undefined,
        };
      }),
    );

    const handoffRows = await Promise.all(
      liveHandoffs.map(async (h) => {
        const c = await ctx.db.get("cases", h.caseId);
        return {
          _id: h._id as string,
          caseId: h.caseId,
          caseTitle: c?.title ?? "Unknown case",
          kind: "handover" as string,
          question: h.reason,
          why: "Your login, not mine. One tap, and I carry on from there.",
          askedAt: h._creationTime,
          remindersSent: 0,
          sendsTo: undefined as string | undefined,
          // The one item on this list that cannot be answered by replying to
          // an email, so it is the only one that gets a link.
          href: `/handover/${h.token}` as string | undefined,
        };
      }),
    );

    const waiting = [...draftRows, ...askRows, ...handoffRows].sort(
      (a, b) => b.askedAt - a.askedAt,
    );

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

/**
 * One case, in full.
 *
 * The board lists; this opens. Everything a case detail screen needs comes from
 * here in one subscription — its tracks, its own activity, its evidence with
 * usable URLs, and the things on it that are waiting on a human.
 */
export const get = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    // Same reasoning as the board: this returns handover tokens.
    if ((await getAuthUserId(ctx)) === null) return null;

    const c = await ctx.db.get("cases", args.caseId);
    if (!c) return null;

    const [tracks, events, evidence, asks, drafts, handoffs, members] = await Promise.all([
      ctx.db
        .query("tracks")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .take(20),
      ctx.db
        .query("events")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .order("desc")
        .take(50),
      ctx.db
        .query("evidence")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .order("desc")
        .take(20),
      ctx.db
        .query("asks")
        .withIndex("by_caseId_and_state", (q) => q.eq("caseId", args.caseId).eq("state", "open"))
        .take(10),
      ctx.db
        .query("drafts")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .take(20),
      ctx.db
        .query("handoffs")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .take(20),
      ctx.db
        .query("caseMembers")
        .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
        .take(20),
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

    const now = Date.now();
    const waiting = [
      ...drafts
        .filter((d) => d.state === "held")
        .map((d) => ({
          _id: d._id as string,
          kind: "approve" as string,
          question: `Approve the ${d.purpose} before I send it`,
          why: d.subject,
          askedAt: d.createdAt,
          remindersSent: 0,
          sendsTo: d.to.join(", ") as string | undefined,
          href: undefined as string | undefined,
        })),
      ...asks.map((a) => ({
        _id: a._id as string,
        kind: a.kind as string,
        question: a.question,
        why: a.why,
        askedAt: a.askedAt,
        remindersSent: a.remindersSent,
        sendsTo: undefined as string | undefined,
        href: undefined as string | undefined,
      })),
      ...handoffs
        .filter((h) => (h.state === "pending" || h.state === "open") && h.expiresAt > now)
        .map((h) => ({
          _id: h._id as string,
          kind: "handover" as string,
          question: h.reason,
          why: "Your login, not mine. One tap, and I carry on from there.",
          askedAt: h._creationTime,
          remindersSent: 0,
          sendsTo: undefined as string | undefined,
          href: `/handover/${h.token}` as string | undefined,
        })),
    ].sort((a, b) => b.askedAt - a.askedAt);

    return {
      _id: c._id,
      title: c.title,
      company: c.company,
      amount: c.amount,
      currency: c.currency,
      reference: c.reference,
      status: c.status,
      summary: c.summary,
      openedAt: c.openedAt ?? c._creationTime,
      lastMovedAt: c.lastMovedAt,
      members: members.map((m) => ({ email: m.email, role: m.role })),
      tracks: tracks.map((t) => ({
        _id: t._id,
        kind: t.kind,
        label: t.label,
        state: t.state,
        detail: t.detail,
      })),
      evidence: files,
      waiting,
      events: events.map((e) => ({ _id: e._id, type: e.type, text: e.text, at: e.at })),
    };
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
