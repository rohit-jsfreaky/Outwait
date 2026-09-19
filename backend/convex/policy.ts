import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { search, scrape } from "./browser/research";
import { EXTRACTOR_VERSION, extractPromise, type Promised } from "./lib/promise";
import { promised } from "./schema";

/**
 * "Read this company's policy" — the one thing on this site a stranger can
 * make the agent go and do, without an account.
 *
 * It exists because the argument this product makes is checkable, and nobody
 * should have to take our word for it. Type a company you have actually dealt
 * with, and the same code that runs on a real claim goes and reads their own
 * page, pulls out the deadline they set themselves, and shows it to you with
 * the sentence and a link. If the page does not say, it says that instead.
 *
 * No model is in this path. The number is found by anchored regex over the
 * page text (`lib/promise.ts`), because a number quoted next to a link is
 * either there when you click or it is a lie.
 */

/** Anything a person might paste, down to a hostname we can search. */
export function hostFrom(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/[^a-z0-9.-]/g, "");
  // A hostname, not a sentence: at least one dot, a plausible TLD, no dashes
  // or dots at the edges.
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(s)) return null;
  if (!/\.[a-z]{2,}$/.test(s)) return null;
  if (s.length > 100) return null;
  return s;
}

/** A cached answer stays good for a week. Policies change, but not hourly. */
const FRESH_MS = 7 * 86400000;

/** Fresh reads allowed per hour across the whole deployment. */
const READS_PER_HOUR = 40;

export const cached = internalQuery({
  args: { domain: v.string(), now: v.number() },
  handler: async (ctx, { domain, now }) => {
    const row = await ctx.db
      .query("policyReads")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .order("desc")
      .first();

    const fresh = row && now - row.readAt < FRESH_MS && row.ver === EXTRACTOR_VERSION;
    const hit = fresh ? row : null;

    // Bounded on purpose — this only ever needs to know "more than the cap?".
    const recent = await ctx.db
      .query("policyReads")
      .withIndex("by_readAt", (q) => q.gt("readAt", now - 3600000))
      .take(READS_PER_HOUR + 1);

    return {
      hit: hit
        ? {
            promise: hit.promise ?? null,
            title: hit.title ?? null,
            source: hit.source ?? null,
            readAt: hit.readAt,
          }
        : null,
      busy: recent.length > READS_PER_HOUR,
    };
  },
});

export const store = internalMutation({
  args: {
    domain: v.string(),
    promise: v.optional(promised),
    title: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("policyReads")
      .withIndex("by_domain", (q) => q.eq("domain", args.domain))
      .first();

    if (existing) {
      await ctx.db.patch("policyReads", existing._id, {
        ...args,
        readAt: now,
        ver: EXTRACTOR_VERSION,
      });
      return now;
    }
    await ctx.db.insert("policyReads", { ...args, readAt: now, ver: EXTRACTOR_VERSION });
    return now;
  },
});

export type Read =
  | { ok: false; reason: string }
  | {
      ok: true;
      domain: string;
      readAt: number;
      cached: boolean;
      promise: Promised | null;
      source: string | null;
      title: string | null;
    };

export const read = action({
  args: { domain: v.string() },
  handler: async (ctx, { domain }): Promise<Read> => {
    const host = hostFrom(domain);
    if (!host) {
      return { ok: false, reason: "That does not look like a website address." };
    }

    const now = Date.now();
    const { hit, busy } = await ctx.runQuery(internal.policy.cached, { domain: host, now });
    if (hit) {
      return {
        ok: true,
        domain: host,
        readAt: hit.readAt,
        cached: true,
        promise: hit.promise,
        source: hit.source,
        title: hit.title,
      };
    }
    if (busy) {
      return {
        ok: false,
        reason: "A lot of people are trying this right now. Give it a few minutes.",
      };
    }

    let found: Array<{ title: string; url: string }> = [];
    try {
      found = await search(`${host} refund policy how long to get my money back`, 5);
    } catch {
      return { ok: false, reason: "Could not reach the web just now. Try again in a moment." };
    }

    // Only their own pages. A refund policy that belongs to a different
    // business is worse than none — the same guard the real research step
    // uses, for the same reason.
    const theirs = found.filter((r) => {
      try {
        return new URL(r.url).hostname.replace(/^www\./, "").endsWith(host);
      } catch {
        return false;
      }
    });

    if (theirs.length === 0) {
      await ctx.runMutation(internal.policy.store, { domain: host });
      return {
        ok: true,
        domain: host,
        readAt: now,
        cached: false,
        promise: null,
        source: null,
        title: null,
      };
    }

    let promise: Promised | null = null;
    let source: string | null = null;
    let title: string | null = null;

    for (const hit2 of theirs.slice(0, 3)) {
      let page = "";
      try {
        page = await scrape(hit2.url);
      } catch {
        continue;
      }
      const got = extractPromise(page);
      if (got) {
        promise = got;
        source = hit2.url;
        title = hit2.title;
        break;
      }
    }

    const readAt = await ctx.runMutation(internal.policy.store, {
      domain: host,
      promise: promise ? { days: promise.days, unit: promise.unit, quote: promise.quote } : undefined,
      title: title ?? theirs[0].title,
      source: source ?? theirs[0].url,
    });

    return {
      ok: true,
      domain: host,
      readAt,
      cached: false,
      promise,
      source: source ?? theirs[0].url,
      title: title ?? theirs[0].title,
    };
  },
});
