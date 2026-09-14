import { v } from "convex/values";
import { mutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { routeAround } from "../tracks";

/**
 * What happens next. Deterministic — no model call reaches this file.
 *
 * `model.ts` reads prose and returns fields. This decides what the agent does
 * with them. Keeping those apart is why a rerun produces the same case instead
 * of a different story each time.
 */

/**
 * Open the full set of tracks for a case and start everything that does not
 * need a human. The point of the shape is that a block on one track never
 * stops the others.
 */
export const openAllTracks = mutation({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args) => {
    const c = await ctx.db.get("cases", args.caseId);
    if (!c) return null;

    const existing = await ctx.db
      .query("tracks")
      .withIndex("by_caseId", (q) => q.eq("caseId", args.caseId))
      .take(20);
    const have = new Set(existing.map((t) => t.label));

    const planned: Array<{
      kind: "email" | "portal" | "registry" | "research" | "escalation";
      label: string;
      detail: string;
    }> = [
      {
        kind: "email",
        label: `Write to ${c.company.name}`,
        detail: c.company.replyTo ? `Reply-to found: ${c.company.replyTo}` : "Finding the address",
      },
      {
        kind: "research",
        label: "Read their own policy",
        detail: "Looking for the deadline they set themselves",
      },
      {
        kind: "registry",
        label: "Register on the claims service",
        detail: "My own account, my own address",
      },
      {
        kind: "portal",
        label: "File on the tenancy portal",
        detail: "Needs a login that is yours, not mine",
      },
      {
        kind: "escalation",
        label: "Find who they answer to",
        detail: "Only used if they go quiet",
      },
    ];

    const ids: string[] = [];
    for (const t of planned) {
      if (have.has(t.label)) continue;
      const id = await ctx.db.insert("tracks", {
        caseId: args.caseId,
        kind: t.kind,
        label: t.label,
        state: "ready",
        detail: t.detail,
        lastMovedAt: Date.now(),
      });
      ids.push(id);
    }

    if (ids.length > 0) {
      await ctx.db.insert("events", {
        caseId: args.caseId,
        type: "tracks.opened",
        text: `Opened ${ids.length} more tracks. One of them will need you; the rest will not.`,
        at: Date.now(),
      });
    }

    // Everything that does not need a human starts now.
    await ctx.scheduler.runAfter(0, internal.agent.decide.runUnblocked, { caseId: args.caseId });
    return ids;
  },
});

/**
 * Run every track that does not need a human, right now, in parallel.
 *
 * This is the behaviour the finish line asks for: while one track sits blocked
 * on a person, the others visibly move.
 */
export const runUnblocked = internalAction({
  args: { caseId: v.id("cases") },
  handler: async (ctx, args): Promise<null> => {
    const [tracks, snapshot] = await Promise.all([
      ctx.runQuery(internal.tracks.listForCase, { caseId: args.caseId }),
      ctx.runQuery(internal.workflows.chase.caseSnapshot, { caseId: args.caseId }),
    ]);
    if (!snapshot) return null;

    const jobs: Promise<unknown>[] = [];

    for (const t of tracks) {
      if (t.state !== "ready") continue;

      if (t.kind === "research") {
        jobs.push(
          ctx.runAction(internal.browser.research.readTheirPolicy, {
            caseId: args.caseId,
            trackId: t._id,
            company: snapshot.company,
            domain: snapshot.domain,
          }),
        );
      }

      if (t.kind === "registry") {
        // Route-around order: email first, then the agent's own account, and
        // only then a human. A registry account is the agent's own, so it
        // never involves the person.
        const route = routeAround({ emailPossible: false, agentCanRegister: true });
        jobs.push(
          ctx
            .runMutation(internal.tracks.noteRouteAround, {
              caseId: args.caseId,
              trackId: t._id,
              chose: route === "own_account" ? "own account" : route,
              because: "The claims service needs an account",
            })
            .then(() =>
              ctx.runMutation(internal.tracks.move, {
                trackId: t._id,
                to: "running",
                detail: "Registering in my own name",
              }),
            ),
        );
      }
    }

    await Promise.allSettled(jobs);
    return null;
  },
});
