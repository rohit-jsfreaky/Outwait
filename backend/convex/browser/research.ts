import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { dueAt, extractPromise, sayPromise, type Promised } from "../lib/promise";
import { promiseUnit } from "../schema";

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

/**
 * Read a page properly, rather than trusting the search snippet.
 *
 * A snippet is ~160 characters chosen by a search engine to look relevant. The
 * sentence that actually carries a company's own deadline is almost never in
 * it, and on the pages that matter it is usually inside an accordion that only
 * exists after the page runs. So the page gets rendered and read in full.
 */
export async function scrape(url: string): Promise<string> {
  const json = await firecrawl("/scrape", {
    url,
    formats: ["markdown"],
    onlyMainContent: true,
    // Their own words are the whole point — banners and nav are not.
    excludeTags: ["nav", "header", "footer", "script", "style"],
    waitFor: 1200,
    timeout: 25000,
  });
  return String(json?.data?.markdown ?? "");
}

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

      // Read the pages they publish, best match first, and stop at the first
      // one that actually states a deadline. Two is the cap: a third scrape
      // rarely finds what the first two did not, and this runs on every case.
      let promise: Promised | null = null;
      let promiseFrom = "";
      for (const hit of hits.slice(0, 2)) {
        let page = "";
        try {
          page = await scrape(hit.url);
        } catch {
          // A page that will not render is not a failed case. Keep the source.
          continue;
        }
        const found = extractPromise(page);
        if (found) {
          promise = found;
          promiseFrom = hit.url;
          break;
        }
      }

      const best = hits[0];
      await ctx.runMutation(internal.browser.research.recordPolicy, {
        caseId: args.caseId,
        trackId: args.trackId,
        title: best.title,
        url: best.url,
        snippet: best.snippet,
        promise: promise
          ? {
              days: promise.days,
              unit: promise.unit,
              quote: promise.quote,
              source: promiseFrom,
            }
          : undefined,
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
    promise: v.optional(
      v.object({ days: v.number(), unit: promiseUnit, quote: v.string(), source: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.insert("evidence", {
      caseId: args.caseId,
      kind: "their_policy",
      source: args.url,
      locator: args.title,
      text: args.snippet,
      readBy: "code",
      at: now,
    });

    if (args.promise) {
      const c = await ctx.db.get("cases", args.caseId);
      const p = { ...args.promise, readAt: now };

      await ctx.db.patch("cases", args.caseId, {
        promise: p,
        // Counted from when the claim really started, not from when we read
        // the page — a case forwarded in today may already be six weeks old.
        deadline: dueAt(c?.openedAt ?? c?._creationTime ?? now, p),
      });

      // The sentence itself is evidence, separate from the page it came from.
      // It is what gets quoted back at them, so it is stored verbatim.
      await ctx.db.insert("evidence", {
        caseId: args.caseId,
        kind: "their_promise",
        source: args.promise.source,
        locator: sayPromise(p),
        text: args.promise.quote,
        readBy: "code",
        at: now,
      });
    }

    await ctx.db.patch("tracks", args.trackId, {
      state: "done",
      detail: args.promise
        ? `They promise ${sayPromise({ ...args.promise, quote: "" })}`
        : args.title.slice(0, 70),
      lastMovedAt: now,
    });

    await ctx.db.insert("events", {
      caseId: args.caseId,
      type: "research.policy",
      text: args.promise
        ? `Their own policy says ${sayPromise({ ...args.promise, quote: "" })}. That is now on the case, in their words.`
        : `Read their own policy: ${args.title.slice(0, 66)}`,
      at: now,
    });
    return null;
  },
});
