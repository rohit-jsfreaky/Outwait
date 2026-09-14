import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * The research track: read the company's own policy, and find who they answer
 * to when they ignore it.
 *
 * This is the quietly devastating part of the product. Companies publish their
 * own turnaround times and then miss them. Quoting a company's own words back
 * at them, with a date, is worth more than any amount of complaining.
 *
 * Search and scrape only — no browser session, no interact. 1 credit a scrape.
 */

const BASE = "https://api.firecrawl.dev/v2";

async function firecrawl(path: string, body: unknown): Promise<any> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Firecrawl ${path}: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export type Found = { title: string; url: string; snippet: string };

/** Web search, scoped to what actually helps a case. */
export async function search(query: string, limit = 5): Promise<Found[]> {
  const json = await firecrawl("/search", { query, limit });
  const results = json?.data?.web ?? json?.data ?? [];
  return (Array.isArray(results) ? results : [])
    .map((r: any) => ({
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      snippet: String(r.description ?? r.snippet ?? "").slice(0, 300),
    }))
    .filter((r: Found) => r.url);
}

/**
 * Find who regulates this kind of dispute, and where you complain to them.
 *
 * Deliberately searched rather than hardcoded: the right body depends on the
 * country and the sector, and a hardcoded list would quietly go stale.
 */
export const findEscalationRoute = internalAction({
  args: {
    caseId: v.id("cases"),
    trackId: v.id("tracks"),
    company: v.string(),
    topic: v.string(),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.tracks.move, {
      trackId: args.trackId,
      to: "running",
      detail: "Looking for who they answer to",
      note: `${args.company} has gone quiet. Finding out who they answer to.`,
    });

    try {
      const hits = await search(
        `${args.topic} complaint authority ombudsman where to escalate India`,
        5,
      );

      if (hits.length === 0) {
        await ctx.runMutation(internal.tracks.move, {
          trackId: args.trackId,
          to: "blocked",
          detail: "No escalation route found yet",
        });
        return null;
      }

      const best = hits[0];
      await ctx.runMutation(internal.browser.research.recordFinding, {
        caseId: args.caseId,
        trackId: args.trackId,
        title: best.title,
        url: best.url,
        snippet: best.snippet,
      });
      return null;
    } catch (err) {
      await ctx.runMutation(internal.tracks.move, {
        trackId: args.trackId,
        to: "blocked",
        detail: `Search failed: ${err instanceof Error ? err.message.slice(0, 80) : "unknown"}`,
      });
      return null;
    }
  },
});

export const recordFinding = internalMutation({
  args: {
    caseId: v.id("cases"),
    trackId: v.id("tracks"),
    title: v.string(),
    url: v.string(),
    snippet: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("evidence", {
      caseId: args.caseId,
      kind: "escalation_route",
      source: args.url,
      locator: args.title,
      text: args.snippet,
      readBy: "code",
      at: Date.now(),
    });

    await ctx.db.patch("tracks", args.trackId, {
      state: "done",
      detail: args.title.slice(0, 70),
      lastMovedAt: Date.now(),
    });

    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "research.found",
      text: `Found the escalation route: ${args.title.slice(0, 70)}`,
      at: Date.now(),
    });
    return null;
  },
});

/**
 * Read the company's own published policy and pin the deadline they set
 * themselves. Their words, their number, their date.
 */
export const readTheirPolicy = internalAction({
  args: {
    caseId: v.id("cases"),
    trackId: v.id("tracks"),
    company: v.string(),
    domain: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.tracks.move, {
      trackId: args.trackId,
      to: "running",
      detail: "Reading what they promise in writing",
    });

    try {
      const site = args.domain ? ` site:${args.domain}` : "";
      const raw = await search(
        `${args.company} refund policy turnaround time how long${site}`,
        4,
      );

      // Only accept a page that is actually on the company's own domain.
      //
      // Without this, searching for "Sunvale Estates refund policy" returned
      // "Refund policy - Sunvale Living" — a real but different business — and
      // the case would have quoted a stranger's terms back at the company.
      // Attributing a policy to the wrong company is worse than finding none.
      const hits = args.domain
        ? raw.filter((r) => {
            try {
              return new URL(r.url).hostname.endsWith(args.domain!.replace(/^www\./, ""));
            } catch {
              return false;
            }
          })
        : [];

      if (hits.length === 0) {
        await ctx.runMutation(internal.tracks.move, {
          trackId: args.trackId,
          to: "done",
          detail: "Nothing published on their own site",
          note: `${args.company} publishes no policy I can verify is theirs. Their own email is the only promise on record, so that is what gets quoted.`,
        });
        return null;
      }

      const best = hits[0];
      await ctx.runMutation(internal.browser.research.recordPolicy, {
        caseId: args.caseId,
        trackId: args.trackId,
        title: best.title,
        url: best.url,
        snippet: best.snippet,
      });
      return null;
    } catch (err) {
      await ctx.runMutation(internal.tracks.move, {
        trackId: args.trackId,
        to: "blocked",
        detail: `Could not read the policy: ${err instanceof Error ? err.message.slice(0, 70) : ""}`,
      });
      return null;
    }
  },
});

export const recordPolicy = internalMutation({
  args: {
    caseId: v.id("cases"),
    trackId: v.id("tracks"),
    title: v.string(),
    url: v.string(),
    snippet: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("evidence", {
      caseId: args.caseId,
      kind: "their_policy",
      source: args.url,
      locator: args.title,
      text: args.snippet,
      readBy: "code",
      at: Date.now(),
    });
    await ctx.db.patch("tracks", args.trackId, {
      state: "done",
      detail: args.title.slice(0, 70),
      lastMovedAt: Date.now(),
    });
    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "research.policy",
      text: `Read their own policy: ${args.title.slice(0, 66)}`,
      at: Date.now(),
    });
    return null;
  },
});
