/**
 * Pull the deadline a company set for itself out of its own published policy.
 *
 * This is the one number on the board that did not come from us. The whole
 * product argument rests on it: they never say no, they just take longer than
 * you will spend — so the strongest sentence in any letter is their own,
 * quoted back with a date attached.
 *
 * No model touches this. A model that hallucinates "14 days" onto a page that
 * never said it would put a false number on a claim and in a letter, and the
 * first person to click the source link would find nothing there. So it is
 * anchored regex over the page text, checked against fixtures of real policy
 * wording and of the sentences that must NOT be read as a promise
 * (`experiments/promise-extraction.test.mjs`).
 *
 * The rule throughout: when in doubt, return null. A case with no promise is
 * honest. A case with the wrong promise is a lie with a citation.
 */

/**
 * Bump this whenever the rules below change.
 *
 * Answers are cached by hostname, so without a version stamp an improvement to
 * the extractor leaves the old, worse answer sitting on the public page for a
 * week. A cached row read by an older version is simply ignored and re-read.
 */
export const EXTRACTOR_VERSION = 10;

export type Promised = {
  /** The number they published. A range is read at its upper bound. */
  days: number;
  unit: "working" | "calendar" | "week" | "month";
  /** The sentence it came from, verbatim, so a person can check it. */
  quote: string;
};

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, sixty: 60, ninety: 90,
};

const NUM = `(\\d{1,3}|${Object.keys(NUM_WORDS).join("|")})`;

/**
 * "within 14 working days", "in 5-7 business days", "up to ten days",
 * "no later than 30 days", "takes 4 to 6 weeks".
 */
const DURATION = new RegExp(
  String.raw`\b(?:with\s?in|in|up\s+to|allow|takes?|no\s+later\s+than|within\s+a\s+maximum\s+of)\s+` +
    String.raw`(?:up\s+to\s+)?${NUM}\s*(?:(?:-|–|—|to)\s*${NUM}\s*)?` +
    String.raw`(working\s+days?|business\s+days?|days?|weeks?|months?)\b`,
  "i",
);

/** The sentence has to be about money or a complaint, not about postage. */
const CONTEXT =
  /\b(refund(?:s|ed|ing)?|repay(?:ment)?|repaid|reimburse[sd]?|credit(?:ed)?|complaint?s?|resolv\w+|respon\w+|repl(?:y|ies)|deposit|dispute|claim|money back|chargeback)\b/i;

/**
 * A deadline the page puts on *you* is not a promise they made. "You must
 * return the item within 14 days" is the single most common sentence on a
 * returns page, and reading it as theirs would invert the whole claim.
 */
const ON_YOU =
  /\byou(?:r)?\b[^.]{0,40}?\b(?:must|needs?|should|have\s+to|has\s+to|are\s+required|is\s+required|responsib\w+)\b/i;

/** The company speaking about itself. Preferred, but not required. */
const SELF = /\b(we|we'?ll|our|us)\b/i;

/**
 * Somebody else's clock.
 *
 * "It can take up to five working days for your bank to process it" is a real
 * sentence on a real refunds page, and it is not a promise the company made —
 * it is them pointing at your bank. Argos publishes exactly this, and without
 * this guard it wins simply by appearing first on the page.
 */
const THIRD_PARTY =
  /\b(?:(?:your|the)\s+(?:bank|banks|card\s+issuer|issuer|card\s+provider|payment\s+provider|building\s+society|credit\s+card\s+company)|(?:mobile\s+phone|carrier|operator)\s+billing|card\s+approval|pre-?authoris\w*|authoris(?:ation|ed)\s+hold)\b/i;

/**
 * A payment provider's window is not the seller's promise either.
 *
 * Argos publishes "PayPal refunds can take up to 30 days, while Klarna refunds
 * can take up to 14 days" — every word of it true, and none of it a deadline
 * Argos set for itself. Naming these is narrow and will never be complete, but
 * a named provider in the sentence is a reliable signal that the clock being
 * described belongs to somebody else.
 */
const PAYMENT_BRAND =
  /\b(paypal|klarna|clearpay|afterpay|laybuy|zip\s+pay|apple\s+pay|google\s+pay|amazon\s+pay|stripe|visa|mastercard|maestro|amex|american\s+express|gift\s+card|gift\s+voucher)\b/i;

/**
 * A window that looks backwards is not a turnaround.
 *
 * Ryanair publishes "if a passenger ... passes away within 10 days prior to
 * your flight, you may apply for travel credit". Ten days is real, and it is
 * an eligibility window, not a promise to pay inside ten days. What gives it
 * away is the preposition straight after the duration, so that is what this
 * looks at rather than trying to understand the sentence.
 */
const BACKWARD = new RegExp(
  DURATION.source +
    String.raw`\s*(?:prior\s+to|before|ahead\s+of|in\s+advance\s+of|preceding|from\s+the\s+date\s+of\s+purchase|of\s+(?:the\s+|your\s+)?(?:purchase|delivery|receipt|booking|travel|departure|dispatch|order|invoice)|of\s+(?:the\s+)?\w+s?\s+being\s+(?:delivered|received|dispatched|sent))`,
  "i",
);

/**
 * The reader doing something is the reader's step, not their deadline.
 *
 * "You can return new and unopened products within 365 days ... for a full
 * refund" is IKEA's actual wording. That 365 days is how long *you* have, and
 * reading it as IKEA's turnaround would put a year on a claim. It slips past
 * ON_YOU because nothing in it is an obligation — it is an offer.
 */
const YOU_ACT =
  /\byou\s+(?:(?:may|can|could|might|will\s+need\s+to)\s+(?:apply|request|claim|submit|ask|contact|return|exchange|send\s+back|bring\s+back)|(?:return|cancel|send\s+back|bring\s+back)\b)/i;

/**
 * How long a thing stays usable is not how long they take to pay.
 *
 * easyJet publishes "we may, in our discretion, offer you a refund or flight
 * voucher ... to be used within six months". The six months is the voucher's
 * shelf life. The giveaway is the verb sitting directly in front of the
 * duration, so that is what this matches.
 */
const VALIDITY = new RegExp(
  String.raw`\b(?:to\s+be\s+used|to\s+use|be\s+used|used|valid|validity|redeem(?:ed|able)?|expires?|expiring|claimed)\s+` +
    DURATION.source,
  "i",
);

/**
 * A voucher is not your money back, so its clock is not the one that matters.
 * This also catches the credit-note and travel-credit wording that airlines
 * reach for when they would rather not refund at all.
 */
const VOUCHER = /\b(voucher|credit\s+note|store\s+credit|travel\s+credit|gift\s+certificate)\b/i;

/** Postage, unless the same sentence is also about money coming back. */
const DELIVERY = /\b(deliver\w*|dispatch\w*|ship(?:s|ped|ping)?|postage|arrive[sd]?|courier)\b/i;
const MONEY = /\b(refund\w*|repay\w*|repaid|reimburse\w*|credit(?:ed)?|deposit|money back|chargeback)\b/i;

function toNumber(token: string): number | null {
  const n = Number(token);
  if (Number.isFinite(n) && n > 0) return n;
  const w = NUM_WORDS[token.toLowerCase()];
  return w ?? null;
}

/**
 * Markdown down to the sentences a person would actually read on the page.
 *
 * Line and table-cell boundaries are kept as separators rather than collapsed
 * into spaces: policy pages put their real answer in a bullet or a table row
 * far more often than in a paragraph, and a whole list run together is one
 * 900-character "sentence" that nothing can match against.
 */
function segments(markdown: string): string[] {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ");

  const out: string[] = [];
  for (const line of cleaned.split(/\r?\n|\|/)) {
    const flat = line
      .replace(/[#*_>`]+/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim()
      // Whatever a list item opens with is decoration, not part of the
      // sentence — and this sentence gets shown inside quotation marks. Boots
      // bullets theirs with "➡", so anything that is not a letter, a digit or
      // an opening quote goes.
      .replace(/^[^A-Za-z0-9"'(]+/, "")
      .replace(/^(?:\d{1,2}[.)])\s+/, "")
      .trim();
    if (!flat) continue;
    for (const piece of flat.split(/(?<=[.!?;])\s+/)) {
      const s = piece.trim();
      if (s.length >= 20 && s.length <= 400) out.push(s);
    }
  }
  return out;
}

function readDuration(sentence: string): Omit<Promised, "quote"> | null {
  const m = DURATION.exec(sentence);
  if (!m) return null;

  const lo = toNumber(m[1]);
  const hi = m[2] ? toNumber(m[2]) : null;
  // A range is read at its upper bound — the most generous reading of their
  // own promise, so "day 47 of 14" is never something they can argue with.
  const days = Math.max(lo ?? 0, hi ?? 0);
  // Nobody promises to refund you in four months. Past this, the number is a
  // return window, a warranty or a guarantee period that happened to land in a
  // sentence about refunds — an ombudsman's eight weeks is the realistic top.
  if (!days || days > 120) return null;

  const raw = m[3].toLowerCase();
  const unit: Promised["unit"] = /week/.test(raw)
    ? "week"
    : /month/.test(raw)
      ? "month"
      : /working|business/.test(raw)
        ? "working"
        : "calendar";

  return { days, unit };
}

/**
 * Read a policy page and return the deadline the company set itself, or null.
 *
 * Preference order is deliberate: a sentence where the company is the subject
 * ("we will refund you within 14 days") beats a passive one ("refunds are
 * processed within 14 days"), and anything that puts the deadline on the
 * reader is thrown out rather than ranked.
 */
export function extractPromise(markdown: string): Promised | null {
  let fallback: Promised | null = null;

  for (const s of segments(markdown.slice(0, 80000))) {
    if (!CONTEXT.test(s)) continue;
    if (ON_YOU.test(s) || YOU_ACT.test(s)) continue;
    if (BACKWARD.test(s) || VALIDITY.test(s)) continue;
    if (VOUCHER.test(s)) continue;
    if (THIRD_PARTY.test(s) || PAYMENT_BRAND.test(s)) continue;
    if (DELIVERY.test(s) && !MONEY.test(s)) continue;

    const d = readDuration(s);
    if (!d) continue;

    const hit: Promised = { ...d, quote: s.slice(0, 240).trim() };
    if (SELF.test(s)) return hit;
    if (!fallback) fallback = hit;
  }

  return fallback;
}

const DAY = 86400000;

/**
 * The date their own promise runs out, counted from when the claim started.
 *
 * Working days are counted Monday to Friday and public holidays are NOT
 * subtracted, because they differ by country and we do not have a calendar we
 * trust. That makes this date land slightly EARLIER than the true one — which
 * is why nothing in the product calls a company late off this number alone;
 * see `GRACE_DAYS`.
 */
export function dueAt(openedAt: number, p: Promised): number {
  if (p.unit === "week") return openedAt + p.days * 7 * DAY;
  if (p.unit === "month") return openedAt + p.days * 30 * DAY;
  if (p.unit === "calendar") return openedAt + p.days * DAY;

  let t = openedAt;
  let left = p.days;
  while (left > 0) {
    t += DAY;
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) left--;
  }
  return t;
}

/**
 * How far past `dueAt` the agent waits before it is willing to say, in writing,
 * that a company is past its own deadline.
 *
 * Holidays we did not count could move their real deadline a few days out. One
 * working week absorbs that everywhere, and by the time this matters a claim is
 * usually weeks over, not hours.
 */
export const GRACE_DAYS = 7;

export function isOverdue(now: number, openedAt: number, p: Promised): boolean {
  return now > dueAt(openedAt, p) + GRACE_DAYS * DAY;
}

/** "14 working days", "3 weeks" — their words, for the screen and the letter. */
export function sayPromise(p: Promised): string {
  const noun =
    p.unit === "working"
      ? "working day"
      : p.unit === "week"
        ? "week"
        : p.unit === "month"
          ? "month"
          : "day";
  return `${p.days} ${noun}${p.days === 1 ? "" : "s"}`;
}
