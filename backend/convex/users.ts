import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Who is signed in, if anyone.
 *
 * Returns `null` rather than throwing when nobody is, because two screens in
 * this app are deliberately reachable without an account:
 *
 *   - /handover/:token — somebody tapped a one-tap link from an email. The
 *     token is the credential. Asking them to sign in first would break the
 *     one thing the product promises, which is that it costs you ten seconds.
 *   - the landing page.
 *
 * Only the board requires a session.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    return {
      _id: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  },
});
