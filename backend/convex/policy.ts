import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { rankPolicyUrls, search, scrape } from "./browser/research";
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

    // Every field is listed rather than spread, because a re-read that finds
    // nothing must CLEAR the old answer. `{...args}` drops absent keys, so the
    // previous promise quietly survived and the ledger kept publishing a
    // number the page no longer supported.
    const row = {
      domain: args.domain,
      promise: args.promise,
      title: args.title,
      source: args.source,
      readAt: now,
      ver: EXTRACTOR_VERSION,
    };

    if (existing) {
      await ctx.db.patch("policyReads", existing._id, row);
      return now;
    }
    await ctx.db.insert("policyReads", row);
    return now;
  },
});

/**
 * Everything anyone has ever asked this to read, and what it found.
 *
 * Public and unauthenticated on purpose. It is the product's own research
 * rather than a dataset we loaded: every row is a company's live page, read by
 * the same code, and every row links to the page so the reading can be
 * checked. The finding it exists to show is the one that surprised us — most
 * companies set themselves no deadline at all.
 *
 * Reactive, so a lookup somebody runs on the landing page joins the list in
 * front of them without a refresh.
 */
export const ledger = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("policyReads").withIndex("by_readAt").order("desc").take(200);

    // Only what the CURRENT rules produced. A row written by an older version
    // is stale by definition, and leaving it in means publishing a reading the
    // code would no longer make — which is how a community forum post stayed
    // on the page as though Sky had written it. Dropped rows come back on
    // their own the next time that company is read.
    const rows = all.filter((r) => r.ver === EXTRACTOR_VERSION).slice(0, 120);

    // Weeks and working days put on one scale, so a middle value means
    // something. Labelled as calendar days wherever it is shown, because
    // "14 working days" and "14 days" are not the same promise.
    const inCalendarDays = (p: { days: number; unit: string }) =>
      p.unit === "week"
        ? p.days * 7
        : p.unit === "month"
          ? p.days * 30
          : p.unit === "working"
            ? Math.round((p.days * 7) / 5)
            : p.days;

    const kept = rows.filter((r) => r.promise);
    const sorted = kept
      .map((r) => inCalendarDays(r.promise!))
      .sort((a, b) => a - b);
    const median =
      sorted.length === 0
        ? null
        : sorted.length % 2
          ? sorted[(sorted.length - 1) / 2]
          : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);

    return {
      total: rows.length,
      publish: kept.length,
      silent: rows.length - kept.length,
      medianDays: median,
      lastReadAt: rows[0]?.readAt ?? null,
      rows: rows.map((r) => ({
        domain: r.domain,
        promise: r.promise ?? null,
        source: r.source ?? null,
        readAt: r.readAt,
      })),
    };
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

/**
 * Read one company's pages and store the result. No cache, no throttle.
 *
 * This is the part `read` does once it has decided the work is worth doing,
 * split out so an admin sweep can refresh the whole ledger in one go. The
 * public path must stay rate-limited; a sweep run from the CLI must not be,
 * or a re-read of thirty companies silently turns into thirty refusals that
 * look exactly like "they publish nothing".
 */
async function readNow(ctx: { runMutation: any }, host: string): Promise<Read> {
    const now = Date.now();
    let found: Array<{ title: string; url: string }> = [];
    try {
      found = await search(`${host} refund policy how long to get my money back`, 5);
    } catch {
      return { ok: false, reason: "Could not reach the web just now. Try again in a moment." };
    }

    // Only their own pages. A refund policy that belongs to a different
    // business is worse than none — the same guard the real research step
    // uses, for the same reason.
    const onDomain = found.filter((r) => {
      try {
        return new URL(r.url).hostname.replace(/^www\./, "").endsWith(host);
      } catch {
        return false;
      }
    });

    const theirs = rankPolicyUrls(onDomain);

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
}

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

    return await readNow(ctx, host);
  },
});

/**
 * Refresh the ledger. CLI only — it ignores both the cache and the throttle,
 * which is exactly why it must not be reachable from the internet.
 */
export const sweep = internalAction({
  args: { domains: v.array(v.string()) },
  handler: async (ctx, { domains }) => {
    const out: Array<{ domain: string; days: number | null; unit: string | null }> = [];
    for (const d of domains) {
      const host = hostFrom(d);
      if (!host) continue;
      const r = await readNow(ctx, host);
      out.push({
        domain: host,
        days: r.ok && r.promise ? r.promise.days : null,
        unit: r.ok && r.promise ? r.promise.unit : null,
      });
    }
    return out;
  },
});
