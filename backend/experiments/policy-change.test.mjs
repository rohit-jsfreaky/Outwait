/**
 * The rule that decides whether a company moved its own deadline.
 *
 * Mirrors `movedPromise` in convex/lib/promise.ts verbatim, the same way
 * otp-extraction and promise-extraction mirror theirs: the lib is TypeScript
 * inside the Convex directory and this runs on bare node.
 *
 *   node experiments/policy-change.test.mjs
 *
 * Every case here is a way this could put a sentence on a public page that a
 * company never wrote. That is the only failure that matters: the ledger is
 * an accusation, and an accusation has to be right.
 */

function movedPromise(before, after) {
  if (!before || !after) return false;
  return before.days !== after.days || before.unit !== after.unit;
}

const VER = 10;

/** What the mutation actually does, guards and all. */
function records(existing, incoming) {
  return (
    existing.ver === VER &&
    existing.source !== undefined &&
    existing.source === incoming.source &&
    movedPromise(existing.promise, incoming.promise)
  );
}

const p = (days, unit, quote = "we aim to refund within " + days) => ({ days, unit, quote });

/** Every case reads the same page unless it is testing the source guard. */
const SRC = "https://example.com/refunds";

const cases = [
  // --- a real move: the same page, a different number --------------------
  ["14 days becomes 30 days", { ver: VER, source: SRC, promise: p(14, "calendar") }, { source: SRC, promise: p(30, "calendar") }, true],
  ["5 days becomes 5 WORKING days", { ver: VER, source: SRC, promise: p(5, "calendar") }, { source: SRC, promise: p(5, "working") }, true],
  ["2 weeks becomes 1 month", { ver: VER, source: SRC, promise: p(2, "week") }, { source: SRC, promise: p(1, "month") }, true],
  ["they shorten it", { ver: VER, source: SRC, promise: p(30, "calendar") }, { source: SRC, promise: p(14, "calendar") }, true],

  // --- not a move --------------------------------------------------------
  ["nothing changed", { ver: VER, source: SRC, promise: p(14, "calendar") }, { source: SRC, promise: p(14, "calendar") }, false],
  [
    "same promise, page reworded",
    { ver: VER, source: SRC, promise: p(14, "calendar", "Refunds are made within 14 days.") },
    { source: SRC, promise: p(14, "calendar", "We will refund you within 14 days of receipt.") },
    false,
  ],

  // --- the dangerous ones ------------------------------------------------
  // Two true sentences on two pages of one site are not a company changing
  // its mind. This is the guard that stops an invented accusation.
  [
    "a DIFFERENT page of the same site",
    { ver: VER, source: "https://example.com/returns", promise: p(14, "calendar") },
    { source: "https://example.com/terms", promise: p(5, "working") },
    false,
  ],
  ["no page recorded before", { ver: VER, source: undefined, promise: p(14, "calendar") }, { source: SRC, promise: p(30, "calendar") }, false],
  ["our extractor improved, not their page", { ver: VER - 1, source: SRC, promise: p(14, "calendar") }, { source: SRC, promise: p(30, "calendar") }, false],
  ["a row from before we versioned", { ver: undefined, source: SRC, promise: p(14, "calendar") }, { source: SRC, promise: p(30, "calendar") }, false],
  ["they published nothing before", { ver: VER, source: SRC, promise: undefined }, { source: SRC, promise: p(14, "calendar") }, false],
  ["we could not find it today", { ver: VER, source: SRC, promise: p(14, "calendar") }, { source: SRC, promise: undefined }, false],
  ["silent both times", { ver: VER, source: SRC, promise: undefined }, { source: SRC, promise: undefined }, false],
];

let bad = 0;
for (const [name, existing, incoming, want] of cases) {
  const got = records(existing, incoming);
  if (got !== want) {
    bad++;
    console.log(`FAIL  ${name}\n      wanted ${want}, got ${got}`);
  }
}

console.log(`${cases.length - bad}/${cases.length} passed`);
process.exit(bad ? 1 : 0);
