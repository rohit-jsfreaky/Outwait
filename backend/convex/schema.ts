import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The data model from DESIGN.md section 7.
//
// `events` is deliberately the single live feed the UI subscribes to. One
// reactive query drives the whole board, which is also the Convex "live
// updates" story for the judges.
//
// Auth lands in Phase 6 (multi-user + shared cases). Until then `createdBy` is
// optional and `caseMembers` is unused, so adding Convex Auth later slots in
// without reshaping anything.

export const trackKind = v.union(
  v.literal("email"),
  v.literal("portal"),
  v.literal("registry"),
  v.literal("research"),
  v.literal("escalation"),
);

export const trackState = v.union(
  v.literal("ready"),
  v.literal("running"),
  v.literal("blocked"),
  v.literal("done"),
  v.literal("abandoned"),
);

export const askKind = v.union(
  v.literal("confirm"),
  v.literal("fact"),
  v.literal("file"),
  v.literal("approve"),
  v.literal("login"),
);

export default defineSchema({
  cases: defineTable({
    title: v.string(),
    company: v.object({
      name: v.string(),
      domain: v.optional(v.string()),
      replyTo: v.optional(v.string()),
    }),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    reference: v.optional(v.string()),
    status: v.union(
      v.literal("intake"),
      v.literal("working"),
      v.literal("waiting_on_them"),
      v.literal("waiting_on_you"),
      v.literal("won"),
      v.literal("closed"),
    ),
    // The one-line story of what the agent is doing right now.
    summary: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    // Who forwarded the email in. This is who the agent writes back to.
    ownerEmail: v.optional(v.string()),
    deadline: v.optional(v.number()),
    lastMovedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_lastMovedAt", ["lastMovedAt"]),

  caseMembers: defineTable({
    caseId: v.id("cases"),
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("member")),
  })
    .index("by_caseId", ["caseId"])
    .index("by_email", ["email"]),

  tracks: defineTable({
    caseId: v.id("cases"),
    kind: trackKind,
    label: v.string(),
    state: trackState,
    detail: v.optional(v.string()),
    blockedOnAskId: v.optional(v.id("asks")),
    lastMovedAt: v.number(),
  })
    .index("by_caseId", ["caseId"])
    .index("by_caseId_and_state", ["caseId", "state"]),

  threads: defineTable({
    caseId: v.optional(v.id("cases")),
    agentmailThreadId: v.string(),
    inboxId: v.optional(v.string()),
    party: v.union(v.literal("company"), v.literal("user"), v.literal("authority")),
    subject: v.optional(v.string()),
    lastMessageAt: v.number(),
  })
    // Inbound routing looks the thread up by AgentMail's id, so this index is
    // the hot path for every webhook call.
    .index("by_agentmailThreadId", ["agentmailThreadId"])
    .index("by_caseId", ["caseId"]),

  messages: defineTable({
    caseId: v.optional(v.id("cases")),
    threadId: v.optional(v.id("threads")),
    agentmailMessageId: v.string(),
    agentmailThreadId: v.optional(v.string()),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.optional(v.string()),
    preview: v.optional(v.string()),
    body: v.optional(v.string()),
    at: v.number(),
  })
    // Used to drop duplicate webhook deliveries. Svix retries on failure and
    // reuses the same message, so inbound has to be idempotent.
    .index("by_agentmailMessageId", ["agentmailMessageId"])
    .index("by_caseId", ["caseId"])
    .index("by_threadId", ["threadId"]),

  asks: defineTable({
    caseId: v.id("cases"),
    kind: askKind,
    question: v.string(),
    why: v.optional(v.string()),
    state: v.union(v.literal("open"), v.literal("answered"), v.literal("cancelled")),
    askedAt: v.number(),
    remindersSent: v.number(),
    answeredBy: v.optional(v.string()),
    answeredAt: v.optional(v.number()),
    answerValue: v.optional(v.string()),
  })
    .index("by_caseId", ["caseId"])
    .index("by_state", ["state"])
    .index("by_caseId_and_state", ["caseId", "state"]),

  drafts: defineTable({
    caseId: v.id("cases"),
    agentmailDraftId: v.optional(v.string()),
    purpose: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    body: v.string(),
    state: v.union(
      v.literal("held"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("rejected"),
    ),
    approvedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_caseId", ["caseId"])
    .index("by_state", ["state"]),

  handoffs: defineTable({
    caseId: v.id("cases"),
    token: v.string(),
    reason: v.string(),
    targetUrl: v.string(),
    profileName: v.string(),
    forEmail: v.optional(v.string()),
    state: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("done"),
      v.literal("expired"),
    ),
    sessionId: v.optional(v.id("browserSessions")),
    usedBy: v.optional(v.string()),
    usedAt: v.optional(v.number()),
    expiresAt: v.number(),
  })
    // The one-tap link carries only this token, so it must be indexed.
    .index("by_token", ["token"])
    .index("by_caseId", ["caseId"]),

  browserSessions: defineTable({
    caseId: v.id("cases"),
    handoffId: v.optional(v.id("handoffs")),
    scrapeId: v.string(),
    profileName: v.string(),
    liveViewUrl: v.optional(v.string()),
    interactiveLiveViewUrl: v.optional(v.string()),
    state: v.union(v.literal("starting"), v.literal("live"), v.literal("stopped"), v.literal("failed")),
    startedAt: v.number(),
    // Firecrawl sessions are 10 min TTL / 5 min idle, hard. Nothing may assume
    // a session is still alive; this is what the UI reads to know.
    expiresAt: v.number(),
    stoppedAt: v.optional(v.number()),
  })
    .index("by_caseId", ["caseId"])
    .index("by_scrapeId", ["scrapeId"]),

  evidence: defineTable({
    caseId: v.id("cases"),
    kind: v.string(),
    source: v.string(),
    locator: v.optional(v.string()),
    text: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    readBy: v.union(v.literal("code"), v.literal("model")),
    at: v.number(),
  }).index("by_caseId", ["caseId"]),

  // The audit trail AND the live feed. The board subscribes to this.
  events: defineTable({
    caseId: v.optional(v.id("cases")),
    type: v.string(),
    text: v.string(),
    payload: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_caseId", ["caseId"])
    .index("by_at", ["at"]),
});
