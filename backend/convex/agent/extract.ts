import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { extractCase as runModel } from "./model";

/**
 * Turn a forwarded email into a case.
 *
 * The model reads the prose and returns fields. Everything after that — what
 * the case looks like, which tracks open, what the board says — is written by
 * the deterministic mutation below, so the same email always produces the same
 * case shape.
 */

export async function extractCase(
  ctx: ActionCtx,
  input: {
    messageId: any;
    threadId: any;
    from: string;
    subject?: string;
    body: string;
    at: number;
  },
): Promise<null> {
  let fields;
  try {
    fields = await runModel({ from: input.from, subject: input.subject, body: input.body });
  } catch (err) {
    await ctx.runMutation(internal.mail.inbound.noteEvent, {
      type: "extract.failed",
      text: `Could not read that email: ${err instanceof Error ? err.message : String(err)}`,
    });
    return null;
  }

  await ctx.runMutation(internal.agent.extract.createCaseFromEmail, {
    messageId: input.messageId,
    threadId: input.threadId,
    forwardedBy: input.from,
    at: input.at,
    title: fields.title,
    companyName: fields.companyName,
    companyDomain: fields.companyDomain,
    replyTo: fields.replyTo,
    amount: fields.amount,
    currency: fields.currency,
    reference: fields.reference,
    summary: fields.summary,
  });
  return null;
}

function bareAddress(value: string): string {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim().toLowerCase();
}

/** The deterministic half. No model call happens in here. */
export const createCaseFromEmail = internalMutation({
  args: {
    messageId: v.id("messages"),
    threadId: v.id("threads"),
    forwardedBy: v.string(),
    at: v.number(),
    title: v.string(),
    companyName: v.string(),
    companyDomain: v.optional(v.string()),
    replyTo: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    reference: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("threads", args.threadId);
    if (!thread) return null;
    // Another delivery may already have built the case for this thread.
    if (thread.caseId) return null;

    const ownerEmail = bareAddress(args.forwardedBy);

    const caseId = await ctx.db.insert("cases", {
      title: args.title,
      company: {
        name: args.companyName,
        domain: args.companyDomain,
        replyTo: args.replyTo,
      },
      amount: args.amount,
      currency: args.currency,
      reference: args.reference,
      status: "working",
      summary: args.summary,
      ownerEmail,
      openedAt: args.at,
      lastMovedAt: args.at,
    });

    await ctx.db.insert("caseMembers", { caseId, email: ownerEmail, role: "owner" });

    // A case is many tracks, not one line (DESIGN.md section 5). Opening them
    // now is what lets one block without stopping the others later.
    const tracks: Array<{ kind: "email" | "research"; label: string; detail: string }> = [
      {
        kind: "email",
        label: `Write to ${args.companyName}`,
        detail: args.replyTo ? `Reply-to found: ${args.replyTo}` : "Finding the right address",
      },
      {
        kind: "research",
        label: "Read their own policy",
        detail: "Looking for the deadline they have to meet",
      },
    ];
    for (const t of tracks) {
      await ctx.db.insert("tracks", {
        caseId,
        kind: t.kind,
        label: t.label,
        state: "ready",
        detail: t.detail,
        lastMovedAt: args.at,
      });
    }

    await ctx.db.patch("threads", args.threadId, { caseId, party: "user" });
    await ctx.db.patch("messages", args.messageId, { caseId });

    const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", INR: "₹" };
    const money =
      args.amount !== undefined
        ? ` for ${args.currency ? (symbols[args.currency] ?? args.currency + " ") : ""}${args.amount.toLocaleString()}`
        : "";
    await ctx.db.insert("events", {
      caseId,
      type: "case.created",
      text: `Case opened against ${args.companyName}${money}. Nobody filled in a form.`,
      at: args.at,
    });

    return caseId;
  },
});
