import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { sendMessage } from "./mail/client";
import { internalAction } from "./_generated/server";

/**
 * Shared cases.
 *
 * A deposit is usually not one person's. Three flatmates lost 60,000 between
 * them, and any one of them can answer a question or approve a letter. So an
 * ask goes to everyone on the case, and the first answer closes it for all of
 * them — nobody does the same job twice.
 *
 * Members are identified by email, not by an account, because the whole
 * product reaches people by email. Someone can be useful on a case without
 * ever creating a login.
 */

function bare(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

export const listForCase = query({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("caseMembers")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20);
    return rows.map((m) => ({ _id: m._id, email: m.email, role: m.role }));
  },
});

export const recipientsFor = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("caseMembers")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20);
    if (rows.length > 0) return rows.map((m) => m.email);
    const c = await ctx.db.get("cases", args.caseId);
    return c?.ownerEmail ? [c.ownerEmail] : [];
  },
});

export const invite = mutation({
  args: { caseId: v.id("cases"), email: v.string() },
  handler: async (ctx, args) => {
    const email = bare(args.email);
    const existing = await ctx.db
      .query("caseMembers")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20);
    if (existing.some((m) => m.email === email)) return null;

    await ctx.db.insert("caseMembers", { caseId: args.caseId, email, role: "member" });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "member.added",
      text: `${email} is on this case now. Either of you can answer anything I ask.`,
      at: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.members.sendInvite, {
      caseId: args.caseId,
      email,
    });
    return email;
  },
});

export const inviteContext = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) return null;
    return { title: c.title, company: c.company.name, summary: c.summary };
  },
});

export const sendInvite = internalAction({
  args: { caseId: v.id("cases"), email: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const c = await ctx.runQuery(internal.members.inviteContext, { caseId: args.caseId });
    if (!c) return null;

    await sendMessage({
      to: [args.email],
      subject: `${c.title} — you are on this now`,
      text: [
        `Someone added you to the ${c.company} case.`,
        "",
        c.summary ?? "",
        "",
        "You do not need an account and you do not need to visit anything. I will email you if I need something, and whoever answers first is enough — the other person will not be asked again.",
      ]
        .filter(Boolean)
        .join("\n"),
      labels: ["invite"],
    });
    return null;
  },
});

/**
 * Record who answered, so the board can say it out loud. The point of a shared
 * case is that the others can stop worrying about it.
 */
export const noteAnsweredBy = internalMutation({
  args: { caseId: v.id("cases"), who: v.string(), what: v.string() },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("caseMembers")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20);
    const others = members.filter((m) => m.email !== bare(args.who)).length;

    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "member.answered",
      text:
        others > 0
          ? `${bare(args.who)} ${args.what}. The other ${others === 1 ? "person" : `${others} people`} on this case do not need to.`
          : `${bare(args.who)} ${args.what}.`,
      at: Date.now(),
    });
    return null;
  },
});

/** Remove a member from a case. */
export const remove = internalMutation({
  args: { caseId: v.id("cases"), email: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("caseMembers")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20);
    let removed = 0;
    for (const m of rows) {
      if (m.email === bare(args.email)) {
        await ctx.db.delete("caseMembers", m._id);
        removed++;
      }
    }
    return removed;
  },
});

/** Delete events whose text contains a given string. Used to scrub demo data. */
export const scrubEvents = internalMutation({
  args: { caseId: v.id("cases"), contains: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("events")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(200);
    let removed = 0;
    for (const e of rows) {
      if (e.text.toLowerCase().includes(args.contains.toLowerCase())) {
        await ctx.db.delete("events", e._id);
        removed++;
      }
    }
    return removed;
  },
});
