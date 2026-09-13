import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Work out what a case is actually waiting on, from the rows themselves.
 *
 * Each thing that blocks a case used to set the status directly, which meant
 * clearing one blocker cleared the status even when another was still open —
 * reject a stale draft and a case genuinely waiting on a human would quietly
 * claim to be working. Deriving it here removes that whole class of bug.
 */
export async function recomputeCaseStatus(
  ctx: MutationCtx,
  caseId: Id<"cases">,
  fallback: "working" | "waiting_on_them" = "working",
) {
  const [openAsks, recentDrafts, handoffs] = await Promise.all([
    ctx.db
      .query("asks")
      .withIndex("by_caseId_and_state", (q) => q.eq("caseId", caseId).eq("state", "open"))
      .take(1),
    ctx.db
      .query("drafts")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .take(20),
    ctx.db
      .query("handoffs")
      .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
      .take(20),
  ]);

  const heldDraft = recentDrafts.some((d) => d.state === "held");
  const openHandoff = handoffs.some(
    (h) => (h.state === "pending" || h.state === "open") && h.expiresAt > Date.now(),
  );

  const status =
    openAsks.length > 0 || heldDraft || openHandoff ? "waiting_on_you" : fallback;

  await ctx.db.patch("cases", caseId, { status, lastMovedAt: Date.now() });
  return status;
}
