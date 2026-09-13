import { v } from "convex/values";
import { internalMutation, internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { extractCase } from "../agent/extract";
import { extractCode } from "./otp";

/**
 * webhook -> mutation -> events -> live UI.
 *
 * This is the Convex live-updates path: an email lands, AgentMail POSTs to
 * `convex/http.ts`, that calls `recordInbound` below, and every board watching
 * `api.cases.board` moves without anybody refreshing anything.
 *
 * Everything here is deterministic. The only model call is the extraction,
 * which runs afterwards in a scheduled action so a slow model can never make
 * the webhook time out and get retried.
 */

/** Pull a bare address out of `Jane Doe <jane@example.com>`. */
function bareAddress(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

export const recordInbound = internalMutation({
  args: {
    agentmailMessageId: v.string(),
    agentmailThreadId: v.string(),
    inboxId: v.optional(v.string()),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.optional(v.string()),
    preview: v.optional(v.string()),
    text: v.optional(v.string()),
    at: v.number(),
  },
  handler: async (ctx, args) => {
    // Svix retries a failed delivery with the SAME message id, so this has to
    // be idempotent or a retry would create a second case.
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_agentmailMessageId", (q) =>
        q.eq("agentmailMessageId", args.agentmailMessageId),
      )
      .unique();
    if (existing) {
      return { duplicate: true as const, messageId: existing._id };
    }

    let thread = await ctx.db
      .query("threads")
      .withIndex("by_agentmailThreadId", (q) =>
        q.eq("agentmailThreadId", args.agentmailThreadId),
      )
      .unique();

    if (!thread) {
      const threadId = await ctx.db.insert("threads", {
        agentmailThreadId: args.agentmailThreadId,
        inboxId: args.inboxId,
        party: "user",
        subject: args.subject,
        lastMessageAt: args.at,
      });
      thread = await ctx.db.get("threads", threadId);
    } else {
      await ctx.db.patch("threads", thread._id, { lastMessageAt: args.at });
    }
    if (!thread) throw new Error("thread insert failed");

    const messageId = await ctx.db.insert("messages", {
      caseId: thread.caseId,
      threadId: thread._id,
      agentmailMessageId: args.agentmailMessageId,
      agentmailThreadId: args.agentmailThreadId,
      direction: "inbound",
      from: args.from,
      to: args.to,
      subject: args.subject,
      preview: args.preview,
      body: args.text,
      at: args.at,
    });

    await ctx.db.insert("events", {
      caseId: thread.caseId,
      type: "mail.received",
      text: thread.caseId
        ? `Reply from ${bareAddress(args.from)}`
        : `New mail from ${bareAddress(args.from)} — reading it`,
      at: args.at,
    });

    if (thread.caseId) {
      await ctx.db.patch("cases", thread.caseId, { lastMovedAt: args.at });
    }

    return {
      duplicate: false as const,
      messageId,
      threadId: thread._id,
      caseId: thread.caseId,
      hasCase: thread.caseId !== undefined,
    };
  },
});

export const getMessage = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => ctx.db.get("messages", args.messageId),
});

/**
 * Runs after the webhook has already answered 204. A forwarded email with no
 * case behind it becomes a new case; anything else is left for Phase 3.
 */
export const processInbound = internalAction({
  args: { messageId: v.id("messages"), threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(internal.mail.inbound.getMessage, {
      messageId: args.messageId,
    });
    if (!message) return null;

    const body = message.body ?? message.preview ?? "";
    if (body.trim().length === 0) {
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        type: "mail.empty",
        text: "That email had no readable text, so there was nothing to work from.",
      });
      return null;
    }

    // Boundary 1. If the agent has a signup in flight, mail carrying a code is
    // that code — not a new case. Checked before extraction so a verification
    // email never turns into a case. The code is found by regex, never by a
    // model: a model asked to "find the code" in a hostile email can be talked
    // into returning something else.
    const signup = await ctx.runQuery(internal.mail.otp.openSignup, {});
    if (signup) {
      const code = extractCode(`${message.subject ?? ""}\n${body}`);
      if (code) {
        await ctx.runMutation(internal.mail.otp.recordCode, { signupId: signup._id, code });
        return null;
      }
    }

    await extractCase(ctx, {
      messageId: args.messageId,
      threadId: args.threadId,
      from: message.from,
      subject: message.subject,
      body,
      at: message.at,
    });
    return null;
  },
});

export const noteEvent = internalMutation({
  args: {
    caseId: v.optional(v.id("cases")),
    type: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: args.type,
      text: args.text,
      at: Date.now(),
    });
    return null;
  },
});

export type { Id };
