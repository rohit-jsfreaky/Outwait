// Check the policy-deadline extractor against the shapes real policy pages use,
// and against the sentences that must NOT be read as a promise.
//
// Mirrors convex/lib/promise.ts exactly. Run: node experiments/promise-extraction.test.mjs
//
// The decoys matter more than the hits here. The number this pulls out goes on
// a claim and into a letter with a link beside it, so a wrong one is a lie the
// reader can check. Silence is the correct answer far more often than not.

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15,
  twenty: 20, thirty: 30, forty: 40, sixty: 60, ninety: 90,
};

const NUM = `(\\d{1,3}|${Object.keys(NUM_WORDS).join("|")})`;

const DURATION = new RegExp(
  String.raw`\b(?:with\s?in|in|up\s+to|allow|takes?|no\s+later\s+than|within\s+a\s+maximum\s+of)\s+` +
    String.raw`(?:up\s+to\s+)?${NUM}\s*(?:(?:-|–|—|to)\s*${NUM}\s*)?` +
    String.raw`(working\s+days?|business\s+days?|days?|weeks?|months?)\b`,
  "i",
);

const CONTEXT =
  /\b(refund(?:s|ed|ing)?|repay(?:ment)?|repaid|reimburse[sd]?|credit(?:ed)?|complaint?s?|resolv\w+|respon\w+|repl(?:y|ies)|deposit|dispute|claim|money back|chargeback)\b/i;

const ON_YOU =
  /\byou(?:r)?\b[^.]{0,40}?\b(?:must|needs?|should|have\s+to|has\s+to|are\s+required|is\s+required|responsib\w+)\b/i;
const SELF = /\b(we|we'?ll|our|us)\b/i;
const THIRD_PARTY =
  /\b(?:(?:your|the)\s+(?:bank|banks|card\s+issuer|issuer|card\s+provider|payment\s+provider|building\s+society|credit\s+card\s+company)|(?:mobile\s+phone|carrier|operator)\s+billing|card\s+approval|pre-?authoris\w*|authoris(?:ation|ed)\s+hold)\b/i;
const BACKWARD = new RegExp(
  DURATION.source +
    String.raw`\s*(?:prior\s+to|before|ahead\s+of|in\s+advance\s+of|preceding|from\s+the\s+date\s+of\s+purchase|of\s+(?:the\s+|your\s+)?(?:purchase|delivery|receipt|booking|travel|departure|dispatch|order|invoice)|of\s+(?:the\s+)?\w+s?\s+being\s+(?:delivered|received|dispatched|sent))`,
  "i",
);
const YOU_ACT =
  /\byou\s+(?:(?:may|can|could|might|will\s+need\s+to)\s+(?:apply|request|claim|submit|ask|contact|return|exchange|send\s+back|bring\s+back)|(?:return|cancel|send\s+back|bring\s+back)\b)/i;
const VALIDITY = new RegExp(
  String.raw`\b(?:to\s+be\s+used|to\s+use|be\s+used|used|valid|validity|redeem(?:ed|able)?|expires?|expiring|claimed)\s+` +
    DURATION.source,
  "i",
);
const VOUCHER = /\b(voucher|credit\s+note|store\s+credit|travel\s+credit|gift\s+certificate)\b/i;
const PAYMENT_BRAND =
  /\b(paypal|klarna|clearpay|afterpay|laybuy|zip\s+pay|apple\s+pay|google\s+pay|amazon\s+pay|stripe|visa|mastercard|maestro|amex|american\s+express|gift\s+card|gift\s+voucher)\b/i;
const DELIVERY = /\b(deliver\w*|dispatch\w*|ship(?:s|ped|ping)?|postage|arrive[sd]?|courier)\b/i;
const MONEY = /\b(refund\w*|repay\w*|repaid|reimburse\w*|credit(?:ed)?|deposit|money back|chargeback)\b/i;

function toNumber(token) {
  const n = Number(token);
  if (Number.isFinite(n) && n > 0) return n;
  return NUM_WORDS[token.toLowerCase()] ?? null;
}

function segments(markdown) {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ");

  const out = [];
  for (const line of cleaned.split(/\r?\n|\|/)) {
    const flat = line
      .replace(/[#*_>`]+/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim()
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

function readDuration(sentence) {
  const m = DURATION.exec(sentence);
  if (!m) return null;
  const lo = toNumber(m[1]);
  const hi = m[2] ? toNumber(m[2]) : null;
  const days = Math.max(lo ?? 0, hi ?? 0);
  if (!days || days > 120) return null;
  const raw = m[3].toLowerCase();
  const unit = /week/.test(raw)
    ? "week"
    : /month/.test(raw)
      ? "month"
      : /working|business/.test(raw)
        ? "working"
        : "calendar";
  return { days, unit };
}

function extractPromise(markdown) {
  let fallback = null;
  for (const s of segments(markdown.slice(0, 80000))) {
    if (!CONTEXT.test(s)) continue;
    if (ON_YOU.test(s) || YOU_ACT.test(s)) continue;
    if (BACKWARD.test(s) || VALIDITY.test(s)) continue;
    if (VOUCHER.test(s)) continue;
    if (THIRD_PARTY.test(s) || PAYMENT_BRAND.test(s)) continue;
    if (DELIVERY.test(s) && !MONEY.test(s)) continue;
    const d = readDuration(s);
    if (!d) continue;
    const hit = { ...d, quote: s.slice(0, 240).trim() };
    if (SELF.test(s)) return hit;
    if (!fallback) fallback = hit;
  }
  return fallback;
}

const DAY = 86400000;

function dueAt(openedAt, p) {
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

// ── must find a promise ──────────────────────────────────────────────────────

const should = [
  [
    "We will refund you within 14 working days of receiving the returned item.",
    { days: 14, unit: "working" },
  ],
  [
    "Refunds are usually processed in 5-7 business days.",
    { days: 7, unit: "working" },
  ],
  [
    "Please allow 28 days for the refund to reach your account.",
    { days: 28, unit: "calendar" },
  ],
  [
    "We endeavour to resolve all complaints within eight weeks.",
    { days: 8, unit: "week" },
  ],
  [
    "Your deposit will be repaid no later than 10 days after the tenancy ends.",
    { days: 10, unit: "calendar" },
  ],
  [
    "Any credit takes up to two months to appear on your statement.",
    { days: 2, unit: "month" },
  ],
  [
    "## Refunds\n\n| Method | Timeframe |\n| --- | --- |\n| Card | Refunded within 10 working days |\n",
    { days: 10, unit: "working" },
  ],
  [
    "- Cancellations are acknowledged immediately.\n- Money back within 21 days.\n- Questions to support.\n",
    { days: 21, unit: "calendar" },
  ],
  [
    "We aim to respond to every complaint within 3 working days.",
    { days: 3, unit: "working" },
  ],
  [
    "See our [returns policy](https://x.example/returns). We reimburse approved claims in 30 days.",
    { days: 30, unit: "calendar" },
  ],
  // The company speaking about itself wins over a passive line earlier on the page.
  [
    "Refunds are processed in 30 days.\nWe will issue your refund within 5 working days of approval.",
    { days: 5, unit: "working" },
  ],
  // A list bullet is punctuation, not part of the sentence we put in quotes.
  [
    "- We will refund you within 14 working days of approval.",
    {
      days: 14,
      unit: "working",
      quote: "We will refund you within 14 working days of approval.",
    },
  ],
  // Their own promise has to beat somebody else's clock further up the page.
  [
    "- For all refunds, it can take up to five working days for your bank to process it.\n- We will issue the refund within 14 days of receiving the item.",
    { days: 14, unit: "calendar" },
  ],
];

// ── must find nothing ────────────────────────────────────────────────────────

const shouldNot = [
  // A deadline on the reader is not a promise from them.
  "You must return the item within 14 days of delivery.",
  "Your claim needs to be submitted within 30 days or it will be rejected.",
  "You are required to notify us in 7 days for a refund to be considered.",
  // Postage, not money.
  "Orders are delivered within 3-5 working days.",
  "We dispatch all items in 2 business days.",
  // Money, but no duration anywhere.
  "We will refund you as soon as reasonably possible.",
  "Refunds are issued at our discretion.",
  // A duration, but nothing to do with a claim.
  "Our showroom is open seven days a week.",
  "Sign up in 2 minutes and start today.",
  // Somebody else's clock. Argos publishes this one on a live page, word for
  // word, and without the guard it wins by appearing first.
  "- For all refunds, it can take up to five working days for your bank to process it into your account.",
  "Once issued, please allow 3-5 working days for your card issuer to credit the funds.",
  // A window that looks backwards. Ryanair publishes this one, word for word.
  "If a passenger on your booking or an immediate family member (partner/parent/child only) passes away within 10 days prior to your flight, you may apply for travel credit using our Travel Credit Request Form.",
  "Claims must be raised within 30 days of purchase to qualify for a refund.",
  // A payment provider's window, also straight off a live Argos page.
  "PayPal refunds can take up to 30 days, while Klarna refunds can take up to 14 days.",
  "Refunds to a gift card are credited within 3 working days.",
  // The customer's own return window, offered not obliged. IKEA publishes this.
  "If you are not totally satisfied with your IKEA purchase you can return new and unopened products within 365 days, together with your proof of purchase, for a full refund.",
  "You can exchange or return any item within 28 days for a refund.",
  // A guarantee period is not a turnaround.
  "All repairs carry a refund-backed guarantee for 24 months.",
  // A voucher shelf life, not a refund turnaround. easyJet publishes this.
  "Our team will review your case and if your circumstances qualify we may, in our discretion, offer you a refund or flight voucher towards the value of a subsequent flight, to be used within six months;",
  "Any credit note must be redeemed within 90 days of issue.",
  // A return window wearing a refund sentence. H&M publishes this one.
  "We offer a refund or exchange with a receipt, within 30 days of the purchase date, using the original payment method.",
  // The carrier's statement, not the seller. Apple publishes this one.
  "Mobile phone billing —It might take up to 60 days for the statement to show the refund.",
  // An authorisation hold releasing is the card network, not the seller.
  "Credit card: Card approval cancellation within 3-5 business days",
  // ASOS: a return window with no modal verb in front of it.
  "If you return an item within 28 days of the item being delivered to you we will refund it.",
  // Nothing at all.
  "",
  "Cookies help us improve this website.",
];

let failed = 0;

for (const [text, want] of should) {
  const got = extractPromise(text);
  const ok =
    got &&
    got.days === want.days &&
    got.unit === want.unit &&
    (want.quote === undefined || got.quote === want.quote);
  if (!ok) {
    failed++;
    console.log(`FAIL  want ${want.days} ${want.unit}  got ${got ? `${got.days} ${got.unit}` : "null"}`);
    console.log(`      ${JSON.stringify(text.slice(0, 90))}`);
  }
}

for (const text of shouldNot) {
  const got = extractPromise(text);
  if (got) {
    failed++;
    console.log(`FAIL  want null  got ${got.days} ${got.unit}`);
    console.log(`      quote: ${JSON.stringify(got.quote.slice(0, 90))}`);
  }
}

// ── the clock ────────────────────────────────────────────────────────────────

// Thu 2026-01-01 + 5 working days = Thu 2026-01-08 (skips Sat 3rd, Sun 4th).
const thursday = Date.UTC(2026, 0, 1);
const five = dueAt(thursday, { days: 5, unit: "working", quote: "" });
if (new Date(five).toISOString().slice(0, 10) !== "2026-01-08") {
  failed++;
  console.log(`FAIL  5 working days from 2026-01-01 -> ${new Date(five).toISOString().slice(0, 10)}, want 2026-01-08`);
}

const cal = dueAt(thursday, { days: 5, unit: "calendar", quote: "" });
if (new Date(cal).toISOString().slice(0, 10) !== "2026-01-06") {
  failed++;
  console.log(`FAIL  5 calendar days from 2026-01-01 -> ${new Date(cal).toISOString().slice(0, 10)}, want 2026-01-06`);
}

const total = should.length + shouldNot.length + 2;
console.log(failed === 0 ? `ok — ${total} cases` : `${failed} of ${total} failed`);
process.exit(failed === 0 ? 0 : 1);
