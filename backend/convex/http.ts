import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifySvix } from "./lib/svix";

/**
 * Because `convex.config.ts` registers static hosting with
 * `defineApp({ httpPrefix: "/api" })`, everything routed here is served under
 * `/api`. The URL to register with AgentMail is therefore:
 *
 *   https://<deployment>.convex.site/api/agentmail/webhook
 */
const http = httpRouter();

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Read the body as raw text. Signature verification is over the exact
    // bytes AgentMail sent, so it must not be re-serialised from parsed JSON.
    const raw = await request.text();

    const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
    if (!secret) {
      console.error("AGENTMAIL_WEBHOOK_SECRET is not set — refusing the delivery");
      return new Response("not configured", { status: 500 });
    }

    const verified = await verifySvix(secret, request.headers, raw);
    if (!verified.ok) {
      console.warn(`rejected webhook: ${verified.reason}`);
      return new Response("bad signature", { status: 400 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("bad json", { status: 400 });
    }
    if (typeof payload !== "object" || payload === null) {
      return new Response("bad payload", { status: 400 });
    }

    const body = payload as Record<string, unknown>;
    const eventType = typeof body.event_type === "string" ? body.event_type : "";

    // Only inbound mail builds cases. Sent/delivered/bounced land in Phase 3.
    if (eventType !== "message.received") {
      return new Response(null, { status: 204 });
    }

    const message = body.message;
    if (typeof message !== "object" || message === null) {
      return new Response("no message", { status: 400 });
    }
    const m = message as Record<string, unknown>;

    const messageId = typeof m.message_id === "string" ? m.message_id : undefined;
    const threadId = typeof m.thread_id === "string" ? m.thread_id : undefined;
    const from = typeof m.from === "string" ? m.from : undefined;
    if (!messageId || !threadId || !from) {
      return new Response("missing fields", { status: 400 });
    }

    const to = Array.isArray(m.to) ? m.to.filter((x): x is string => typeof x === "string") : [];
    const timestamp = typeof m.timestamp === "string" ? Date.parse(m.timestamp) : NaN;

    const stored = await ctx.runMutation(internal.mail.inbound.recordInbound, {
      agentmailMessageId: messageId,
      agentmailThreadId: threadId,
      inboxId: typeof m.inbox_id === "string" ? m.inbox_id : undefined,
      from,
      to,
      subject: typeof m.subject === "string" ? m.subject : undefined,
      preview: typeof m.preview === "string" ? m.preview : undefined,
      text: typeof m.text === "string" ? m.text : undefined,
      at: Number.isFinite(timestamp) ? timestamp : Date.now(),
    });

    // Reading the email needs a model call, which is far slower than a webhook
    // should be. Answer now, think after — otherwise Svix times out and retries
    // a delivery we already accepted.
    if (!stored.duplicate && stored.threadId && !stored.hasCase) {
      await ctx.scheduler.runAfter(0, internal.mail.inbound.processInbound, {
        messageId: stored.messageId,
        threadId: stored.threadId,
      });
    }

    return new Response(null, { status: 204 });
  }),
});

export default http;
