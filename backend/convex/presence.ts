import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Presence } from "@convex-dev/presence";

/**
 * Who else is on this case right now.
 *
 * A deposit is rarely one person's problem — it is three flatmates, or a family.
 * DESIGN.md section 8: presence shows who is looking at a case, and during a
 * handover it shows who is driving. That second part matters: when someone is
 * typing a password into the embedded browser, everyone else should be able to
 * see that it is happening and that it is not them.
 */
export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    // No per-user reads in here, so every subscriber shares one cache entry.
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // Called over HTTP from sendBeacon when a tab closes, so there is no auth
    // context available here by design.
    return await presence.disconnect(ctx, sessionToken);
  },
});
