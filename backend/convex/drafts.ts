import { v } from "convex/values";
import { mutation, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { createDraft, sendDraft, sendMessage } from "./mail/client";
import { recomputeCaseStatus } from "./lib/status";

/**
 * BOUNDARY 2 — the agent asks before it commits.
 *
 * Anything binding stops here: a formal complaint, accepting an offer, anything
 * that names a number, anything going to a regulator. The agent composes it as
 * a real AgentMail Draft and emails a copy to the human. The draft is only sent
 * after a person says yes.
 *
 * The important part is WHERE the gate lives. It is not a prompt telling the
 * model to behave. The model never has a way to send — only `approve` below
 * calls `sendDraft`, and only a human reply or a human click reaches it. If a
 * control depends on the model cooperating, it is not a control.
 */

export const pendingFor = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const held = await ctx.db
      .query("drafts")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .order("desc")
      .take(5);
    return held.find((d) => d.state === "held") ?? null;
  },
});

export const load = internalQuery({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const d = await ctx.db.get("drafts", args.draftId);
    if (!d) return null;
    const c = await ctx.db.get("cases", d.caseId);
    return { draft: d, ownerEmail: c?.ownerEmail, caseTitle: c?.title ?? "case" };
  },
});

/** Compose something binding and hold it. Nothing leaves on this call. */
export const propose = mutation({
  args: {
    caseId: v.id("cases"),
    purpose: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const draftId = await ctx.db.insert("drafts", {
      caseId: args.caseId,
      purpose: args.purpose,
      to: args.to,
      subject: args.subject,
      body: args.body,
      state: "held",
      createdAt: now,
    });

    await ctx.db.patch("cases", args.caseId, { status: "waiting_on_you", lastMovedAt: now });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "draft.held",
      text: `Wrote the ${args.purpose} and stopped. It does not go out until you say so.`,
      at: now,
    });

    await ctx.scheduler.runAfter(0, internal.drafts.createAndAskApproval, { draftId });
    return draftId;
  },
});

export const createAndAskApproval = internalAction({
  args: { draftId: v.id("drafts") },
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(internal.drafts.load, { draftId: args.draftId });
    if (!loaded || loaded.draft.state !== "held" || !loaded.ownerEmail) return null;
    const { draft } = loaded;

    // A real AgentMail Draft, sitting unsent in the agent's own inbox.
    let created;
    try {
      created = await createDraft({
        to: draft.to,
        subject: draft.subject,
        text: draft.body,
        labels: ["held-for-approval"],
      });
    } catch (err) {
      // The draft stays held either way — the gate does not depend on this
      // call succeeding. Surface it instead of failing silently.
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        caseId: draft.caseId,
        type: "draft.compose_failed",
        text: `Could not park the ${draft.purpose} as a draft: ${
          err instanceof Error ? err.message.slice(0, 160) : String(err)
        }`,
      });
      return null;
    }

    // Then show the human exactly what would go out, and to whom.
    const preview = [
      `I have written this and I have not sent it.`,
      ``,
      `To: ${draft.to.join(", ")}`,
      `Subject: ${draft.subject}`,
      ``,
      `--------------------`,
      draft.body,
      `--------------------`,
      ``,
      `Reply "yes" and I will send it. Reply "no" and I will not.`,
    ].join("\n");

    // Any member can approve. Whoever gets to it first is enough.
    const to = await ctx.runQuery(internal.members.recipientsFor, { caseId: draft.caseId });
    const sent = await sendMessage({
      to: to.length > 0 ? to : [loaded.ownerEmail],
      subject: `${loaded.caseTitle} — approve before I send this`,
      text: preview,
      labels: ["approval"],
    });

    await ctx.runMutation(internal.drafts.recordCreated, {
      draftId: args.draftId,
      agentmailDraftId: created.draft_id,
      agentmailThreadId: sent.thread_id,
      agentmailMessageId: sent.message_id,
      to: loaded.ownerEmail,
      subject: `${loaded.caseTitle} — approve before I send this`,
      body: preview,
    });
    return null;
  },
});

export const recordCreated = internalMutation({
  args: {
    draftId: v.id("drafts"),
    agentmailDraftId: v.string(),
    agentmailThreadId: v.string(),
    agentmailMessageId: v.string(),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const d = await ctx.db.get("drafts", args.draftId);
    if (!d) return null;
    await ctx.db.patch("drafts", args.draftId, { agentmailDraftId: args.agentmailDraftId });

    // Bind the approval thread to the case so the yes/no lands already routed.
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_agentmailThreadId", (q) =>
        q.eq("agentmailThreadId", args.agentmailThreadId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("threads", {
        caseId: d.caseId,
        agentmailThreadId: args.agentmailThreadId,
        party: "user",
        subject: args.subject,
        lastMessageAt: Date.now(),
      });
    } else if (!existing.caseId) {
      await ctx.db.patch("threads", existing._id, { caseId: d.caseId });
    }

    await ctx.db.insert("messages", {
      caseId: d.caseId,
      agentmailMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId,
      direction: "outbound",
      from: "the case inbox",
      to: [args.to],
      subject: args.subject,
      body: args.body,
      at: Date.now(),
    });

    await ctx.db.insert("events", {
      caseId: d.caseId,
      type: "draft.sent_for_approval",
      text: "Sent you the draft to look at. It is held until you reply.",
      at: Date.now(),
    });
    return null;
  },
});

/**
 * The only path that actually sends. Reached by a human reply or a human
 * click, never by the model.
 */
export const approve = internalAction({
  args: { draftId: v.id("drafts"), approvedBy: v.string() },
  handler: async (ctx, args) => {
    const loaded = await ctx.runQuery(internal.drafts.load, { draftId: args.draftId });
    if (!loaded || loaded.draft.state !== "held") return null;
    const { draft } = loaded;
    if (!draft.agentmailDraftId) return null;

    const sent = await sendDraft(draft.agentmailDraftId);
    await ctx.runMutation(internal.drafts.markSent, {
      draftId: args.draftId,
      approvedBy: args.approvedBy,
      agentmailThreadId: sent.thread_id,
      agentmailMessageId: sent.message_id,
    });
    return null;
  },
});

export const markSent = internalMutation({
  args: {
    draftId: v.id("drafts"),
    approvedBy: v.string(),
    agentmailThreadId: v.string(),
    agentmailMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const d = await ctx.db.get("drafts", args.draftId);
    if (!d) return null;
    const now = Date.now();

    await ctx.db.patch("drafts", args.draftId, { state: "sent", approvedBy: args.approvedBy });

    await ctx.db.insert("threads", {
      caseId: d.caseId,
      agentmailThreadId: args.agentmailThreadId,
      party: "company",
      subject: d.subject,
      lastMessageAt: now,
    });
    await ctx.db.insert("messages", {
      caseId: d.caseId,
      agentmailMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId,
      direction: "outbound",
      from: "the case inbox",
      to: d.to,
      subject: d.subject,
      body: d.body,
      at: now,
    });

    await recomputeCaseStatus(ctx, d.caseId, "waiting_on_them");

    // On a shared case, say WHO approved. "You approved it" shown to three
    // flatmates is wrong for two of them, and the point of sharing a case is
    // that the others can stop thinking about it.
    const members = await ctx.db
      .query("caseMembers")
      .withIndex("by_caseId", (q) => q.eq("caseId", d.caseId))
      .take(20);
    const who = args.approvedBy.replace(/.*<|>.*/g, "").trim().toLowerCase();
    const name = who.split("@")[0];

    await ctx.db.insert("events", {
      caseId: d.caseId,
      type: "draft.approved",
      text:
        members.length > 1
          ? `${name} approved it. The ${d.purpose} has gone to ${d.to.join(", ")}. Nobody else needs to look.`
          : `You approved it. The ${d.purpose} has gone to ${d.to.join(", ")}.`,
      at: now,
    });
    return null;
  },
});

export const reject = internalMutation({
  args: { draftId: v.id("drafts"), by: v.string() },
  handler: async (ctx, args) => {
    const d = await ctx.db.get("drafts", args.draftId);
    if (!d || d.state !== "held") return null;
    await ctx.db.patch("drafts", args.draftId, { state: "rejected", approvedBy: args.by });
    // Another draft, ask or handoff may still be waiting on this person.
    await recomputeCaseStatus(ctx, d.caseId);
    await ctx.db.insert("events", {
      caseId: d.caseId,
      type: "draft.rejected",
      text: `You said no. The ${d.purpose} was not sent, and will not be.`,
      at: Date.now(),
    });
    return null;
  },
});
