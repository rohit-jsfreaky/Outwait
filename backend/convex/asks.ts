import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { askKind } from "./schema";
import { sendMessage } from "./mail/client";
import { recomputeCaseStatus } from "./lib/status";

/**
 * The asks loop.
 *
 * The rule from CLAUDE.md: the agent never makes the user open the app. When
 * it needs something, it sends one short email. The reply comes back on the
 * same AgentMail thread, which is how the answer is matched to the question.
 *
 * Reminder policy is DESIGN.md section 4, and it is deliberate:
 *   now     the ask, with the reason
 *   +2 days one reminder that NAMES WHAT IS BEING LOST
 *   +5 days "I am carrying on without it. Slower, but moving."
 *   after   silence. The work continues.
 *
 * A reminder that does not say what it costs does not get opened.
 */

const DAY = 24 * 60 * 60 * 1000;

export const waitingOnYou = query({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("asks")
      .withIndex("by_state", (q) => q.eq("state", "open"))
      .order("desc")
      .take(25);

    return Promise.all(
      open.map(async (a) => {
        const c = await ctx.db.get("cases", a.caseId);
        return {
          _id: a._id,
          caseId: a.caseId,
          caseTitle: c?.title ?? "Unknown case",
          company: c?.company.name,
          kind: a.kind,
          question: a.question,
          why: a.why,
          askedAt: a.askedAt,
          remindersSent: a.remindersSent,
        };
      }),
    );
  },
});

/** Create the ask row, block a track on it, and schedule the email. */
export const create = mutation({
  args: {
    caseId: v.id("cases"),
    kind: askKind,
    question: v.string(),
    why: v.optional(v.string()),
    blockTrackId: v.optional(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const askId = await ctx.db.insert("asks", {
      caseId: args.caseId,
      kind: args.kind,
      question: args.question,
      why: args.why,
      state: "open",
      askedAt: now,
      remindersSent: 0,
    });

    if (args.blockTrackId) {
      await ctx.db.patch("tracks", args.blockTrackId, {
        state: "blocked",
        blockedOnAskId: askId,
        detail: args.question,
        lastMovedAt: now,
      });
    }

    await ctx.db.patch("cases", args.caseId, { status: "waiting_on_you", lastMovedAt: now });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "ask.created",
      text: `Asked you: ${args.question}`,
      at: now,
    });

    await ctx.scheduler.runAfter(0, internal.asks.sendAskEmail, { askId });
    // One reminder at +2 days, then a final note at +5. Nothing after that.
    await ctx.scheduler.runAfter(2 * DAY, internal.asks.remind, { askId, which: 1 });
    await ctx.scheduler.runAfter(5 * DAY, internal.asks.remind, { askId, which: 2 });

    return askId;
  },
});

export const loadForEmail = internalMutation({
  args: { askId: v.id("asks") },
  handler: async (ctx, args) => {
    const ask = await ctx.db.get("asks", args.askId);
    if (!ask || ask.state !== "open") return null;
    const c = await ctx.db.get("cases", ask.caseId);
    if (!c || !c.ownerEmail) return null;
    return {
      to: c.ownerEmail,
      caseTitle: c.title,
      company: c.company.name,
      question: ask.question,
      why: ask.why,
      kind: ask.kind,
      remindersSent: ask.remindersSent,
      caseId: ask.caseId,
    };
  },
});

/** Short, plain, and it says why. Nobody replies to a wall of text. */
function askBody(input: {
  company: string;
  question: string;
  why?: string;
  kind: string;
}): string {
  const lines = [input.question];
  if (input.why) lines.push("", input.why);
  if (input.kind === "file") {
    lines.push("", "Just reply to this email with a photo attached. That is all I need.");
  } else {
    lines.push("", "Just reply to this email. One line is enough.");
  }
  lines.push("", `I am carrying on with everything else on ${input.company} in the meantime.`);
  return lines.join("\n");
}

export const sendAskEmail = internalAction({
  args: { askId: v.id("asks") },
  handler: async (ctx, args) => {
    const ask = await ctx.runMutation(internal.asks.loadForEmail, { askId: args.askId });
    if (!ask) return null;

    // Everyone on the case gets asked. The first answer closes it for all of
    // them, so nobody does the same job twice.
    const to = await ctx.runQuery(internal.members.recipientsFor, { caseId: ask.caseId });
    const sent = await sendMessage({
      to: to.length > 0 ? to : [ask.to],
      subject: `${ask.caseTitle} — quick thing`,
      text: askBody(ask),
      labels: ["ask"],
    });

    await ctx.runMutation(internal.asks.recordAskThread, {
      askId: args.askId,
      caseId: ask.caseId,
      agentmailThreadId: sent.thread_id,
      agentmailMessageId: sent.message_id,
      to: ask.to,
      subject: `${ask.caseTitle} — quick thing`,
      body: askBody(ask),
    });
    return null;
  },
});

/**
 * Bind the outbound thread to the case, so when the reply lands the webhook
 * can find its way back to this ask without any matching heuristics.
 */
export const recordAskThread = internalMutation({
  args: {
    askId: v.id("asks"),
    caseId: v.id("cases"),
    agentmailThreadId: v.string(),
    agentmailMessageId: v.string(),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("threads")
      .withIndex("by_agentmailThreadId", (q) =>
        q.eq("agentmailThreadId", args.agentmailThreadId),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("threads", {
        caseId: args.caseId,
        agentmailThreadId: args.agentmailThreadId,
        party: "user",
        subject: args.subject,
        lastMessageAt: now,
      });
    } else if (!existing.caseId) {
      await ctx.db.patch("threads", existing._id, { caseId: args.caseId });
    }

    await ctx.db.insert("messages", {
      caseId: args.caseId,
      agentmailMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId,
      direction: "outbound",
      from: "the case inbox",
      to: [args.to],
      subject: args.subject,
      body: args.body,
      at: now,
    });

    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "ask.sent",
      text: "Emailed you the question. No need to open the app.",
      at: now,
    });
    return null;
  },
});

export const remind = internalAction({
  args: { askId: v.id("asks"), which: v.number() },
  handler: async (ctx, args) => {
    const ask = await ctx.runMutation(internal.asks.loadForEmail, { askId: args.askId });
    if (!ask) return null; // answered or cancelled — say nothing

    // A reminder that does not name the cost does not get opened.
    const text =
      args.which === 1
        ? [
            ask.question,
            "",
            ask.why ?? "Without this the claim sits still.",
            "",
            "Reply whenever you get a minute. Everything else is still moving.",
          ].join("\n")
        : [
            "I am carrying on without this.",
            "",
            `It makes the ${ask.company} claim slower, not dead. If you send it later I will use it then.`,
            "",
            ask.question,
          ].join("\n");

    await sendMessage({
      to: [ask.to],
      subject: `${ask.caseTitle} — still waiting on one thing`,
      text,
      labels: ["ask", "reminder"],
    });

    await ctx.runMutation(internal.asks.noteReminder, { askId: args.askId, which: args.which });
    return null;
  },
});

export const noteReminder = internalMutation({
  args: { askId: v.id("asks"), which: v.number() },
  handler: async (ctx, args) => {
    const ask = await ctx.db.get("asks", args.askId);
    if (!ask || ask.state !== "open") return null;
    await ctx.db.patch("asks", args.askId, { remindersSent: args.which });
    await ctx.db.insert("events", {
      caseId: ask.caseId,
      type: "ask.reminded",
      text:
        args.which === 1
          ? "Sent one reminder, and said what it costs to wait."
          : "Carrying on without it. Slower, but moving.",
      at: Date.now(),
    });
    return null;
  },
});

/** Close the ask and unblock whatever was waiting on it. */
export const answer = internalMutation({
  args: {
    askId: v.id("asks"),
    answeredBy: v.string(),
    answerValue: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ask = await ctx.db.get("asks", args.askId);
    if (!ask || ask.state !== "open") return null;
    const now = Date.now();

    await ctx.db.patch("asks", args.askId, {
      state: "answered",
      answeredBy: args.answeredBy,
      answeredAt: now,
      answerValue: args.answerValue,
    });

    // Whatever was blocked on this ask starts moving again.
    const blocked = await ctx.db
      .query("tracks")
      .withIndex("by_caseId_and_state", (q) => q.eq("caseId", ask.caseId).eq("state", "blocked"))
      .take(10);
    for (const t of blocked) {
      if (t.blockedOnAskId === args.askId) {
        await ctx.db.patch("tracks", t._id, {
          state: "running",
          blockedOnAskId: undefined,
          detail: args.note ?? "Got what I needed. Carrying on.",
          lastMovedAt: now,
        });
      }
    }

    // Another ask, a held draft or an open handoff may still need this person.
    await recomputeCaseStatus(ctx, ask.caseId);

    await ctx.db.insert("events", {
      caseId: ask.caseId,
      type: "ask.answered",
      text: args.note ?? `You answered: ${args.answerValue.slice(0, 80)}`,
      at: now,
    });

    // On a shared case, say out loud that the others are off the hook.
    await ctx.runMutation(internal.members.noteAnsweredBy, {
      caseId: ask.caseId,
      who: args.answeredBy,
      what: "answered that",
    });
    return null;
  },
});
