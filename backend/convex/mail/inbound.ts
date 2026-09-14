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

    const subject = message.subject ?? "";
    const body = message.body ?? message.preview ?? "";

    // Boundary 1 runs FIRST, before any emptiness check.
    //
    // Plenty of verification mails carry the code in the SUBJECT and have no
    // usable text body at all — "586331 is your supermemory sign-in code" is
    // exactly that shape. Checking the body first threw those away as empty
    // before anyone looked at them.
    //
    // The code is found by regex, never by a model: a model asked to "find the
    // code" in a hostile email can be talked into returning something else.
    // And it only looks while a signup is genuinely in flight, so a mail full
    // of digits is otherwise just a new case.
    const signup = await ctx.runQuery(internal.mail.otp.openSignup, {});
    if (signup) {
      const code = extractCode(`${subject}\n${message.preview ?? ""}\n${body}`);
      if (code) {
        await ctx.runMutation(internal.mail.otp.recordCode, { signupId: signup._id, code });
        return null;
      }
    }

    if (body.trim().length === 0) {
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        type: "mail.empty",
        text: "That email had no readable text, so there was nothing to work from.",
      });
      return null;
    }

    // Machine mail is not a case.
    //
    // Found the hard way: a stray verification code opened a case called
    // "Supermemory sign-in alert", and a bounce notice opened one called
    // "Sunvale Estates email delivery". Neither is a claim anyone is owed.
    // Only correspondence a person or a company actually wrote should open a
    // case, and that test is deterministic — never a model's opinion.
    const automated = looksAutomated(message.from, subject, body);
    if (automated) {
      await ctx.runMutation(internal.mail.inbound.noteEvent, {
        type: "mail.ignored",
        text: `Ignored an automated email (${automated}). Not a case.`,
      });
      return null;
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

/**
 * Is this machine mail rather than correspondence? Returns the reason, or null.
 *
 * Deliberately narrow. The cost of a false positive is a real claim silently
 * ignored, which is far worse than a junk case, so this only catches shapes
 * that are unambiguous: delivery daemons, no-reply senders, and mail whose
 * whole purpose is a login code.
 */
export function looksAutomated(from: string, subject: string, body: string): string | null {
  const sender = from.toLowerCase();

  if (/mailer-daemon|postmaster@|delivery-?status|bounce/.test(sender)) {
    return "delivery failure notice";
  }
  if (/\bno-?reply@|donotreply@/.test(sender)) return "no-reply sender";

  const head = `${subject} ${body.slice(0, 300)}`.toLowerCase();
  if (/undeliverable|delivery status notification|message could not be delivered/.test(head)) {
    return "delivery failure notice";
  }
  // A mail whose subject is essentially "here is your code".
  if (/\b(sign-?in|log-?in|verification|one-?time|security)\s+code\b/.test(subject.toLowerCase())) {
    return "verification code";
  }
  if (/\b(is your|your)\s+(otp|code|passcode|verification code)\b/.test(head)) {
    return "verification code";
  }
  return null;
}
