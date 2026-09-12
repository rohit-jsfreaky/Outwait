import { query } from "./_generated/server";

/**
 * Phase 0 liveness probe.
 *
 * The point of this query is to prove, on the deployed convex.site URL, that the
 * page is talking to a real Convex backend and not just serving static HTML.
 * Replaced by the real board query in Phase 2.
 */
export const get = query({
  args: {},
  handler: async () => {
    return {
      app: "Outwait",
      tagline: "They wait you out. Outwait waits longer.",
      phase: 0,
      serverTime: Date.now(),
    };
  },
});
