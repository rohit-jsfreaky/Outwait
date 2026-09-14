import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { getMessage, getAttachment } from "./client";
import { classifyReply } from "../agent/model";

/**
 * A reply lands on a case that already exists.
 *
 * The thread is the join: the ask was emailed on an AgentMail thread, that
 * thread is bound to the case, so the reply arrives already routed. No
 * guessing, no matching on subject lines.
 *
 * Attachments are the reason this is an action and not just a mutation. The
 * webhook payload carries the body but NOT the files — the message has to be
 * fetched, and each attachment downloaded, before anything can be stored.
 */

export const openAskFor = internalQuery({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const open = await ctx.db
      .query("asks")
      .withIndex("by_caseId_and_state", (q) => q.eq("caseId", args.caseId).eq("state", "open"))
      .order("desc")
      .take(1);
    return open[0] ?? null;
  },
});

export const processReply = internalAction({
  args: {
    messageId: v.id("messages"),
    caseId: v.id("cases"),
    agentmailMessageId: v.string(),
    from: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch the full message. This is the only way to see attachments.
    let full;
    try {
      full = await getMessage(args.agentmailMessageId);
    } catch (err) {
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        caseId: args.caseId,
        type: "reply.fetch_failed",
        text: `Could not read that reply: ${err instanceof Error ? err.message : String(err)}`,
      });
      return null;
    }

    // `extracted_text` is the new text with the quoted chain stripped, which is
    // what we actually want to read.
    const replyText = (full.extracted_text ?? full.text ?? args.body).trim();
    const attachments = full.attachments ?? [];

    // 2. Store every attachment as case evidence.
    let stored = 0;
    for (const att of attachments.slice(0, 5)) {
      try {
        const { blob, contentType } = await getAttachment(args.agentmailMessageId, att.attachment_id);
        const storageId = await ctx.storage.store(blob);
        await ctx.runMutation(internal.mail.replies.recordEvidence, {
          caseId: args.caseId,
          filename: att.filename ?? "attachment",
          contentType: att.content_type ?? contentType,
          size: att.size,
          storageId,
        });
        stored++;
      } catch (err) {
        await ctx.runMutation(internal.mail.inbound.noteEvent, {
          caseId: args.caseId,
          type: "evidence.failed",
          text: `Could not save ${att.filename ?? "an attachment"}.`,
        });
      }
    }

    // 3. Label the reply. The model labels; it does not decide anything.
    let intent = "answer";
    let summary = replyText.slice(0, 140);
    if (replyText.length > 0) {
      try {
        const c = await classifyReply({
          from: args.from,
          subject: args.subject,
          body: replyText,
        });
        intent = c.intent;
        summary = c.summary;
      } catch {
        // A model failure must never lose a real reply. Fall back to the text.
      }
    }

    // 4a. A held draft outranks an ask: this reply may be the approval that
    // lets something binding go out. Only a human reply reaches this branch —
    // there is no path from the model to `approve`.
    const held = await ctx.runQuery(internal.drafts.pendingFor, { caseId: args.caseId });
    if (held) {
      if (intent === "approval") {
        await ctx.runAction(internal.drafts.approve, {
          draftId: held._id,
          approvedBy: args.from,
        });
        return null;
      }
      if (intent === "refusal") {
        await ctx.runMutation(internal.drafts.reject, { draftId: held._id, by: args.from });
        return null;
      }
      // Anything unclear is not a yes. A draft is never sent on a maybe.
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        caseId: args.caseId,
        type: "draft.unclear",
        text: "That did not read as a yes, so it is still held. Reply yes to send it.",
      });
      return null;
    }

    // 4b. Close the open ask, if there is one. Deterministic from here down.
    const ask = await ctx.runQuery(internal.mail.replies.openAskFor, { caseId: args.caseId });
    if (ask) {
      const note =
        stored > 0
          ? `Got ${stored} file${stored === 1 ? "" : "s"} from you. That unblocks it.`
          : `You answered: ${summary}`;
      await ctx.runMutation(internal.asks.answer, {
        askId: ask._id,
        answeredBy: args.from,
        answerValue: stored > 0 ? `${stored} attachment(s)` : replyText.slice(0, 500),
        note,
      });
    } else {
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        caseId: args.caseId,
        type: `reply.${intent}`,
        text: summary,
      });
    }
    return null;
  },
});

export const recordEvidence = internalMutation({
  args: {
    caseId: v.id("cases"),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("evidence", {
      caseId: args.caseId,
      kind: args.contentType.startsWith("image/") ? "photo" : "file",
      source: "reply from you",
      locator: args.filename,
      storageId: args.storageId,
      readBy: "code",
      at: Date.now(),
    });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "evidence.added",
      text: `${args.filename} is on the case now.`,
      at: Date.now(),
    });
    return null;
  },
});

/**
 * Remove an evidence row and its stored file. Used when a download produced
 * something that is not the file it claimed to be.
 */
export const dropEvidence = internalMutation({
  args: { evidenceId: v.id("evidence") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("evidence", args.evidenceId);
    if (!row) return null;
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete("evidence", args.evidenceId);
    await ctx.db.insert("events", {
      caseId: row.caseId,
      type: "evidence.removed",
      text: `Removed ${row.locator ?? "a file"} from the case.`,
      at: Date.now(),
    });
    return null;
  },
});
