import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { askKind } from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * Data repair and demo seeding.
 *
 * Everything here is an `internalMutation` on purpose: none of it is reachable
 * from the internet, only from the CLI, the dashboard, or another Convex
 * function. Seeding writes real rows through the real tables — there is no
 * separate "demo mode" in the UI, because a demo mode is a thing that can be
 * true on screen and false in the product.
 */

/**
 * Rewrite an address everywhere it is stored.
 *
 * Used once to clear an address that should never have been in this project.
 * Left in because "a wrong address is now in twelve rows" is a real situation
 * and hand-editing rows in a dashboard is how you miss one.
 */
export const rewriteAddress = internalMutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    let changed = 0;

    const drafts = await ctx.db.query("drafts").take(500);
    for (const d of drafts) {
      const patch: Record<string, unknown> = {};
      if (d.approvedBy === from) patch.approvedBy = to;
      if (d.to.includes(from)) patch.to = d.to.map((a) => (a === from ? to : a));
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("drafts", d._id, patch);
        changed++;
      }
    }

    const members = await ctx.db.query("caseMembers").take(500);
    for (const m of members) {
      if (m.email === from) {
        await ctx.db.patch("caseMembers", m._id, { email: to });
        changed++;
      }
    }

    const cases = await ctx.db.query("cases").take(500);
    for (const c of cases) {
      const patch: Record<string, unknown> = {};
      if (c.ownerEmail === from) patch.ownerEmail = to;
      if (c.createdBy === from) patch.createdBy = to;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("cases", c._id, patch);
        changed++;
      }
    }

    const handoffs = await ctx.db.query("handoffs").take(500);
    for (const h of handoffs) {
      const patch: Record<string, unknown> = {};
      if (h.forEmail === from) patch.forEmail = to;
      if (h.usedBy === from) patch.usedBy = to;
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("handoffs", h._id, patch);
        changed++;
      }
    }

    const events = await ctx.db.query("events").take(1000);
    for (const e of events) {
      if (e.text.includes(from)) {
        await ctx.db.patch("events", e._id, { text: e.text.split(from).join(to) });
        changed++;
      }
    }

    return { changed };
  },
});

/** Move a case's clock back, so a real case can read as the age it really is. */
export const backdateCase = internalMutation({
  args: { caseId: v.id("cases"), daysAgo: v.number() },
  handler: async (ctx, { caseId, daysAgo }) => {
    const openedAt = Date.now() - daysAgo * 86400000;
    await ctx.db.patch("cases", caseId, { openedAt });
    return { openedAt };
  },
});

/** Point a case at an address that actually receives mail. */
export const setReplyTo = internalMutation({
  args: { caseId: v.id("cases"), replyTo: v.string() },
  handler: async (ctx, { caseId, replyTo }) => {
    const c = await ctx.db.get("cases", caseId);
    if (!c) throw new Error("no such case");
    await ctx.db.patch("cases", caseId, { company: { ...c.company, replyTo } });
    return { replyTo };
  },
});

const DAY = 86400000;

/**
 * Seed the board so it shows a real spread of cases rather than one.
 *
 * Every row is written through the same tables the agent writes to, so the
 * board renders these exactly as it renders a live case. Backdated, because a
 * board where everything started today does not show the one thing this
 * product is about.
 */
export const seedDemo = internalMutation({
  args: { ownerEmail: v.string() },
  handler: async (ctx, { ownerEmail }) => {
    const now = Date.now();
    const made: Array<{ title: string; caseId: Id<"cases"> }> = [];

    const specs = [
      {
        title: "Gym membership charged after cancelling",
        company: {
          name: "Pulse Fitness",
          domain: "pulsefitness.example",
          replyTo: "memberservices@pulsefitness.example",
        },
        amount: 7800,
        currency: "INR",
        reference: "PF-771204",
        openedDaysAgo: 34,
        movedHoursAgo: 19,
        status: "waiting_on_them" as const,
        summary:
          "Cancelled on 2 August and was charged again on 1 September and 1 October. Two emails so far, no reply to either.",
        tracks: [
          ["email", "Write to Pulse Fitness", "running", "Second chase sent. Nothing back yet."],
          ["research", "Read their own cancellation terms", "done", "14 days notice, which was given"],
          ["research", "Find who they answer to", "done", "Consumer helpline route found"],
        ],
        events: [
          [19 * 3600000, "Wrote again. Nobody has replied yet."],
          [9 * DAY, "Pulse Fitness has gone quiet. Finding out who they answer to."],
          [16 * DAY, "Read their own terms: 14 days notice, which was given."],
          [34 * DAY, "Read the forward. Opened the case and 3 tracks."],
        ],
      },
      {
        title: "Airline refund for a cancelled flight",
        company: {
          name: "Northwind Air",
          domain: "northwindair.example",
          replyTo: "refunds@northwindair.example",
        },
        amount: 24600,
        currency: "INR",
        reference: "NW-4402193",
        openedDaysAgo: 61,
        movedHoursAgo: 3,
        status: "working" as const,
        summary:
          "Flight cancelled by the airline on 16 July. Refund promised in 7 working days, then in 21, then nothing.",
        tracks: [
          ["email", "Write to Northwind Air", "running", "Fourth chase. They keep restarting the clock."],
          ["portal", "File on the refunds portal", "done", "Reference NW-4402193 accepted"],
          ["research", "Find who they answer to", "done", "Aviation regulator takes written complaints"],
          ["escalation", "Escalate to the regulator", "running", "Drafting, 61 days is past their own limit"],
        ],
        events: [
          [3 * 3600000, "Chase running. I will write again in a week whether or not you remember this exists."],
          [2 * DAY, "Filed on the refunds portal in my own name. Reference accepted."],
          [11 * DAY, "They restarted the 21 day clock. That is the third time."],
          [61 * DAY, "Read the forward. Opened the case and 4 tracks."],
        ],
      },
      {
        title: "Deposit returned in full",
        company: {
          name: "Harbour Lettings",
          domain: "harbourlettings.example",
          replyTo: "accounts@harbourlettings.example",
        },
        amount: 38000,
        currency: "INR",
        reference: "HL-2024-0416",
        openedDaysAgo: 88,
        movedHoursAgo: 52,
        status: "won" as const,
        summary: "Paid in full on day 74, after a formal complaint was filed and one reminder sent to the ombudsman.",
        tracks: [
          ["email", "Write to Harbour Lettings", "done", "11 emails over 10 weeks"],
          ["escalation", "Escalate to the ombudsman", "done", "Filed on day 52"],
          ["research", "Read their own policy", "done", "10 working days, which had passed"],
        ],
        events: [
          [52 * 3600000, "Harbour Lettings paid in full. Closing the case."],
          [16 * DAY, "The ombudsman acknowledged the complaint."],
          [36 * DAY, "You approved it. The escalation went to the ombudsman."],
          [88 * DAY, "Read the forward. Opened the case and 3 tracks."],
        ],
      },
    ];

    for (const spec of specs) {
      const openedAt = now - spec.openedDaysAgo * DAY;
      const caseId = await ctx.db.insert("cases", {
        title: spec.title,
        company: spec.company,
        amount: spec.amount,
        currency: spec.currency,
        reference: spec.reference,
        status: spec.status,
        summary: spec.summary,
        ownerEmail,
        openedAt,
        lastMovedAt: now - spec.movedHoursAgo * 3600000,
      });

      await ctx.db.insert("caseMembers", { caseId, email: ownerEmail, role: "owner" });

      for (const [kind, label, state, detail] of spec.tracks) {
        await ctx.db.insert("tracks", {
          caseId,
          kind: kind as "email" | "escalation" | "portal" | "registry" | "research",
          label: label as string,
          state: state as "abandoned" | "blocked" | "done" | "ready" | "running",
          detail: detail as string,
          lastMovedAt: now,
        });
      }

      for (const [agoMs, text] of spec.events) {
        await ctx.db.insert("events", {
          caseId,
          type: "note",
          text: text as string,
          at: now - (agoMs as number),
        });
      }

      made.push({ title: spec.title, caseId });
    }

    return { seeded: made.length, cases: made };
  },
});

/** Remove everything seedDemo made, by title. Keeps real cases untouched. */
export const unseedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const titles = new Set([
      "Gym membership charged after cancelling",
      "Airline refund for a cancelled flight",
      "Deposit returned in full",
    ]);
    const cases = await ctx.db.query("cases").take(200);
    let removed = 0;
    for (const c of cases) {
      if (!titles.has(c.title)) continue;
      for (const table of ["tracks", "events", "caseMembers"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_caseId", (q) => q.eq("caseId", c._id))
          .take(200);
        for (const r of rows) await ctx.db.delete(table, r._id);
      }
      await ctx.db.delete("cases", c._id);
      removed++;
    }
    return { removed };
  },
});

/**
 * Put ask rows on a case and take them off again.
 *
 * "What needs you" shows three rows and hides the rest behind View all, so the
 * list, its filter and the overflow only exist once there are more than three —
 * a branch you cannot see on a board that has two. These write nothing but the
 * `asks` rows themselves: no event, no case status, no email, no reminders. So
 * the board is exactly as it was once `dropAsks` has run with the ids.
 */
export const seedAsks = internalMutation({
  args: {
    caseId: v.id("cases"),
    rows: v.array(
      v.object({ kind: askKind, question: v.string(), why: v.optional(v.string()) }),
    ),
  },
  handler: async (ctx, { caseId, rows }) => {
    const now = Date.now();
    const ids: Array<Id<"asks">> = [];
    for (const [i, r] of rows.entries()) {
      ids.push(
        await ctx.db.insert("asks", {
          caseId,
          kind: r.kind,
          question: r.question,
          why: r.why,
          state: "open",
          // Spread them out so the list has a real order to sort by.
          askedAt: now - (i + 1) * 3600_000,
          remindersSent: 0,
        }),
      );
    }
    return { ids };
  },
});

export const dropAsks = internalMutation({
  args: { ids: v.array(v.id("asks")) },
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete("asks", id);
    return { dropped: ids.length };
  },
});
