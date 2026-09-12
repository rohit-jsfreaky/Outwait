import { defineSchema } from "convex/server";

/**
 * The real schema lands in Phase 2 (see DESIGN.md section 7):
 * cases, caseMembers, tracks, threads, messages, asks, drafts,
 * handoffs, browserSessions, evidence, events.
 *
 * Empty on purpose in Phase 0 — nothing is stored yet.
 */
export default defineSchema({});
