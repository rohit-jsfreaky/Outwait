# Hackathon log

- **Project:** Outwait
- **Event:** Convex All Gas Hackathon sponsored by OpenAI, Firecrawl, & AgentMail
- **What it does:** Works a stuck admin case for weeks — fills the web forms itself, chases by email, and asks a human only for the ten seconds only a human can do.
- **Live app:** https://tangible-finch-783.convex.site
- **Video demo:** https://youtu.be/M2qJqtPx1tQ (2:48)
- **Repo:** https://github.com/rohit-jsfreaky/Outwait
- **Frontend:** Convex static hosting
- **Convex deployment:** https://tangible-finch-783.convex.cloud
- **Components:** @convex-dev/static-hosting, @convex-dev/workflow, @convex-dev/presence
- **Convex features:** schema, tables, indexes, queries, mutations, internal functions, actions, HTTP actions, scheduled functions, crons, file storage, realtime queries
- **Auth:** Convex Auth
- **AI models:** openai/gpt-5.6-luna (via OpenRouter)
- **Started:** 2026-09-12T09:10:36Z
- **Last updated:** 2026-09-20T19:30:00Z

## Log

### 2026-09-12 - c473469

Phase 0. Stood the whole thing up and got it live before writing any product code.

Three separate npm projects in one repo, no workspaces: `backend/` is the Convex
app, `frontend/` is Vite + React, `component/` is reserved for a publishable
Firecrawl `/interact` component and is still empty. Everything was scaffolded with
the official generators rather than by hand — `npm create convex@latest -t bare`
for the backend, `npm create vite@latest --template react-ts` for the frontend,
and `npx @convex-dev/static-hosting setup` to register the hosting component.

The static-hosting setup wrote `defineApp({ httpPrefix: "/api" })` itself, which
settles where our own HTTP routes live: the inbound mail webhook will be served
under `/api`, not at the root. Worth knowing before building against it rather
than after (`convex/convex.config.ts`).

`convex/status.ts` is a single public query returning the app name and server
time, and the landing page subscribes to it with `useQuery`. It exists so the
deployed page proves it is talking to a live Convex backend instead of serving
static HTML — the green line on the page is a real query result. Convex features:
schema, query, realtime query (`backend/convex/status.ts`,
`frontend/src/App.tsx`). The schema is deliberately empty; the real tables land
in the next phase.

Cross-folder deploy verified end to end rather than assumed: the frontend builds
in `frontend/`, `backend/` uploads `../frontend/dist`, and the static-hosting CLI
sets `VITE_CONVEX_URL` on the build so the bundle points at the right deployment.
SPA fallback returns 200 on unknown paths. Deployed to production and confirmed in
a clean browser.

Two things that cost time and are worth writing down. TypeScript 6 deprecates
`baseUrl`, so the `@backend/*` path alias into the sibling Convex folder has to be
declared with `paths` alone (`frontend/tsconfig.app.json`). And Tailwind is on v4
— the Vite plugin plus a one-line `@import "tailwindcss"`, with no config file and
no PostCSS step (`frontend/vite.config.ts`, `frontend/src/index.css`).

Sponsor credentials are set as Convex environment variables on both the dev and
production deployments, not committed: `FIRECRAWL_API_KEY`, `AGENTMAIL_API_KEY`,
`OPENROUTER_API_KEY`, `MODEL_ID`. Names are listed in `backend/.env.example`;
values live only on the deployments. No model is called yet, so **AI models** stays
`none` until there is code to back it.

### 2026-09-12 - d9b15a1

The email spine, end to end. Someone forwards an email and a case opens on the board on its own —
no form, and nobody opens the app. Proven on the production deployment with a real forwarded
message: the case came back with the company, the amount, the currency, the reference and a
one-line summary, plus two open tracks.

Inbound path: AgentMail delivers through Svix to an HTTP action, which verifies the signature,
stores the message, returns 204, and only then schedules the model work. Answering before thinking
is deliberate — a model call takes seconds, and a slow webhook gets retried, which would open the
same case twice. Redelivery is also blocked by an index on the provider message id, since Svix
reuses that id on retry (`convex/http.ts`, `convex/mail/inbound.ts`).

Signature verification is written against the Svix spec using Web Crypto rather than the `svix`
package, because HTTP actions run in the Convex runtime and not Node. It is pinned to the test
vector Svix publishes, so the implementation is checked rather than assumed (`convex/lib/svix.ts`).
Unsigned and forged deliveries both return 400 in production.

One file calls a model and nothing else does: `convex/agent/model.ts`, two named jobs, reading
prose into structured fields. Everything that follows — the case shape, which tracks open, what the
board says — is a deterministic mutation, so the same email always produces the same case
(`convex/agent/extract.ts`).

The board is a single reactive query returning cases, their tracks and the live event feed
together, so one subscription moves the whole screen when mail lands (`convex/cases.ts`,
`frontend/src/App.tsx`). Convex features: schema, indexes, queries, internal mutations, internal
actions, HTTP actions, scheduled functions, realtime queries.

Also in this tree: the browser-handover findings under `backend/experiments/`. A person typed a
password into an embedded Firecrawl interactive live view, the agent carried on in the same
session, and three later sessions reused the saved profile to read a page that only exists behind
that login. The profile write turned out to be asynchronous — reading it back too soon returns an
empty profile — which only showed up by measuring it.

### 2026-09-12 - 069c90f

The asks loop. The agent can now stop, ask a human exactly one question by email, and carry the
answer back onto the case without anyone opening the app. A reply lands on the same thread, gets
classified, closes the ask and unblocks whatever was waiting on it (`convex/asks.ts`,
`convex/mail/replies.ts`, `convex/mail/client.ts`).

### 2026-09-13 - 177b175

Boundary 2: anything binding is written and then **held**. A letter becomes an AgentMail draft and
there is no code path that sends it without a human reply — approval sends, refusal rejects,
anything else stays held (`convex/drafts.ts`).

Case status stopped being assigned by each blocker and is now derived from the rows themselves, so
rejecting a stale draft can no longer clear a case that is still genuinely waiting on a person
(`convex/lib/status.ts`). Verification codes are pulled out of mail by anchored regex rather than a
model, checked against a fixture set of real and decoy messages (`convex/mail/otp.ts`,
`backend/experiments/otp-extraction.test.mjs`).

### 2026-09-14 - 419864b

Boundary 1: the agent signs itself up. When a portal needs an account it registers in its own name
against the case inbox, then reads its own verification code out of that inbox and continues. No
human is involved and no credential of the user's is used (`convex/browser/signup.ts`).

Two ordering bugs, both found by running it rather than reading it: the account is marked
`awaiting_code` *before* the form is submitted, because the code can arrive first; and the OTP check
runs *before* the empty-body guard, because the code is sometimes only in the subject line.

### 2026-09-14 - 6de49ef

The chase itself. A case is now five independent tracks rather than one line, so one blocking does
not stop the others (`convex/tracks.ts`, `convex/agent/decide.ts`). The chase is a durable workflow
that writes, sleeps seven days, writes again, and escalates — `step.sleep` over weeks rather than a
cron re-deriving state (`convex/workflows/chase.ts`, component `@convex-dev/workflow`).

Two guards came out of real misbehaviour: machine mail — bounces, no-reply senders, verification
codes — no longer opens a case, and researched policy text is only attached when the page hostname
matches the company on the case, after an unrelated business's refund policy was stored as if it
were theirs (`convex/mail/inbound.ts`, `convex/browser/research.ts`).

### 2026-09-14 - f6fbf04

Shared cases. Several people on one claim see the same board move without a refresh, and can see
who else is looking at a case and who is holding the wheel during a handover (`convex/presence.ts`,
`convex/members.ts`, `frontend/src/Presence.tsx`, component `@convex-dev/presence`). Proven with two
independent browser contexts: a draft raised from outside both appeared in both, one person
approved, and both dropped it — neither was reloaded.

### 2026-09-14 - 3b2fb6e

Auth, and the design pass.

Sign-in is a six-digit code emailed from the case inbox — no password anywhere, because the product
already reaches people by email and this is the honest version of that (`convex/agentMailOtp.ts`,
`convex/auth.ts`, `frontend/src/SignIn.tsx`). Convex Auth with a custom `Email` provider;
`authTables` in the schema. Proven on production: code requested, code delivered, board opened,
session survived a reload, sign-out returned to the sign-in screen.

Adding it forced a routing change. Convex Auth serves its discovery documents at
`/.well-known/...` and the token's `iss` claim is the site URL with no prefix, so those must be at
the root — but static hosting owned the root and pushed our routes under `/api`. Moved to
static-hosting's app-owned root routing and registered the static catch-all last. Exact routes win,
so the inbound mail webhook kept its existing path and nothing had to be re-registered with the
provider (`convex/convex.config.ts`, `convex/http.ts`).

Fixed a visible inconsistency while verifying: a case could read "waiting on you" while the panel
underneath said nothing was. Status counted a live handover as waiting on a human; the board's
waiting list only gathered questions and held drafts. It now gathers live handovers too, and that
row is the only one with a button rather than "reply to the email" (`convex/cases.ts`). The board
query is also signed-in only now, because it returns handover tokens and a token is a credential.
The handover page itself is deliberately *not* behind auth — somebody tapped a link on their phone
and the token is the credential.

Frontend rebuilt on shadcn/ui installed through its own CLI, with no hand-written primitives. Every
content load is a skeleton of the real layout rather than a spinner. Cases carry an explicit
`openedAt` because `_creationTime` is read-only and a case forwarded in today may already be six
weeks old — elapsed time is the thing this product is actually about.

### 2026-09-15 - 3b2fb6e

The product got its own face, and the board stopped being a console.

Brand assets are generated rather than borrowed: a mark that is the letter O and an hourglass cut
out of one solid shape, an Open Graph card, and six line drawings used as spot art. All trimmed,
recoloured to sit on either surface, and converted to webp (`frontend/public/brand/`). Meta and
favicons wired up in `frontend/index.html`.

The landing page was rebuilt around the one thing this product is about — elapsed time. It is
monochrome by choice, with no gradients anywhere, and it opens on a ledger of a real seven-week
claim where the person appears on exactly two of the seven rows. Dot Grid and Count Up come from
React Bits, installed through the shadcn CLI (`frontend/src/Landing.tsx`,
`frontend/src/components/`).

The board was split into screens. It had been one page carrying every case, every step and the
whole activity log at once, which is a demo rather than a product — nothing could be more important
than anything else. Now a list, a claim opened on its own URL, and history behind a click, with real
`pushState` routes and a working back button (`frontend/src/nav.ts`, `frontend/src/App.tsx`).
`cases.get` was rewritten to serve that detail screen in one subscription — signed-in only, because
it returns handover tokens, with storage URLs for evidence and that case's own open questions
(`convex/cases.ts`).

Then the wording was rewritten for the person who actually uses this. RUNNING became "Happening
now", BLOCKED became "Needs you", "2/5 steps" became a progress bar and "2 of 5 finished", and the
screen opens with a sentence — how much is being chased, across how many claims, for how long.
Monospace and all-caps labels are gone from the interface entirely; steps render as a timeline with
ticks instead of a table.

Two repairs worth recording. `convex/admin.ts` holds internal-only mutations for rewriting an
address across every table and for seeding demo claims through the real tables, because a demo mode
that is separate from the product is a thing that can be true on screen and false underneath. And
`frontend/src/surface.ts` sets `color-scheme` per screen: the scrollbar gutter is painted by the
browser, so a near-black page under a light color-scheme gets a white scrollbar track down its side.

The email spine was re-verified end to end after the earlier routing change, with a real forwarded
message: signed webhook, model extraction, and a new case with the company, amount and reference
pulled out of the mail on its own.

### 2026-09-19 - working tree

"What needs you" was the one panel on the board a person actually acts on, and it was the worst
thing on the screen. It printed every waiting item in full — question, reason, who it sends to,
buttons — one under the other. Two of those fill a rail, and nothing looks more urgent than
anything else when everything is the same size.

It is now three one-line rows, each the same height, saying what the item is and what kind of ten
seconds it costs you: sign in, say yes, or go and find something out. The six ask kinds in the
schema collapse onto those three, because that is the real question a person has before they tap.
The words and the buttons moved into a dialog you open by tapping a row; anything past the third
sits behind **View all**, a filtered list of the same rows (`frontend/src/App.tsx`).

Two details that only matter because this is live data. The open row is read out of the live list
by id rather than held as a copy, so when a handover is completed in another tab the dialog closes
itself instead of sitting there describing something that has already happened. And stepping into a
row from the full list steps back out to the list, not to the board.

That overflow branch could not be seen on a board with two waiting items, so `convex/admin.ts`
gained `seedAsks` / `dropAsks` — internal-only mutations that write nothing but `asks` rows: no
event, no case status, no email, no reminders. The board is exactly as it was once `dropAsks` has
run with the ids.

The handover page (boundary 3) is dark now and goes full width the moment the browser opens —
`max-w-[1500px]`, a `76vh` frame — because the live view is the page at that point, not an
illustration on it. Done no longer ends at "you can close this tab"; there is a way back to the
claims (`frontend/src/Handover.tsx`).

Underneath it, the remote page is zoomed to 150% with larger form controls before anyone sees it.
The live view streams a fixed-viewport browser and Firecrawl has no viewport option yet
(mendableai/firecrawl#1242), so the page itself is enlarged instead. Somebody is about to type a
password into this on a phone, and default-size fields are genuinely unusable for anyone with
imperfect eyesight. The style injection is wrapped so that failing to apply it can never cost the
handover (`convex/handoffs.ts`).

The README was rewritten around researched numbers rather than claims. England and Wales hold
4,706,470 protected tenancy deposits worth £5.53bn, and in 2024/25 the schemes adjudicated 46,950
of them — 1.00%. The disputes that do happen are ordinary ones (cleaning 54%, damage 49%,
redecoration 31%), which is the point: the other 99% are not clean returns, they are people who
stopped. Every figure is sourced to the TDS Statistical Briefing 2025 and attributed inline.
Screenshots are taken from the live deployment, not mocked (`docs/screens/`).

### 2026-09-19 - working tree (2)

The one number on the board that did not come from us.

Every claim now carries the deadline the company set for **itself**, read off its own published
page, quoted word for word, with a link. `convex/lib/promise.ts` pulls it out by anchored regex —
no model, on purpose, because that sentence sits next to a link and a wrong number is a lie anyone
can check in one click. `cases.deadline` finally means something: the promise landed on this
claim's calendar, counted from when the claim actually started.

The decoys were the work, not the hits. Four kinds of sentence look exactly like a promise and are
not one, and all four are real text from real pages: a deadline placed on **you** ("you must
return the item within 14 days"), somebody else's clock ("it can take up to five working days for
your bank to process it" — Argos), a payment provider's window ("PayPal refunds can take up to 30
days, while Klarna refunds can take up to 14 days" — Argos again) and a window that looks
backwards ("within 10 days prior to your flight" — Ryanair, where the ten days is eligibility, not
turnaround). Each one is a fixture now; 32 cases in
`experiments/promise-extraction.test.mjs`, and the rule throughout is that silence beats a guess.

Working days are counted Monday to Friday with no public-holiday calendar, which can only put the
computed date **earlier** than the true one. So nothing calls a company late off that arithmetic:
`GRACE_DAYS` is a full week, and the screen shows two facts — what they publish, what day this is —
and leaves the subtraction to the reader.

Then the same thing was opened to anyone, because an argument you cannot check is just a claim.
`convex/policy.ts` is a public action behind a new landing section: type a company you have
actually dealt with and the code that runs on a real claim goes and reads their pages while you
wait. Argos gives itself 14 days and Ryanair 5 working days, and where it finds nothing it says so
plainly rather than inventing something. (This entry also named Currys as publishing nothing.
Currys publishes 14 days; the first read simply missed the page. Corrected 2026-09-20 below.)
Answers are cached by hostname for a
week, so the second person to ask about a company costs nothing, and each row carries the
extractor version that produced it: improving the rules invalidates the old answers instead of
leaving a worse one live for a week.

Three wrong answers were found by running it against real sites rather than by reading the code,
and each one became a fixture before it became a fix.

The section is laid out in two columns with a seventh spot drawing beside the question — a
magnifying glass over a page with the one line inside the glass drawn brighter than the rest
(`frontend/public/brand/doodle-magnifier.webp`). It sits beside the question rather than the
answer, because the answer below it can run to several lines and the art should not be dragged
down with it.

### 2026-09-19 - working tree (3)

The reader turned into research.

Every lookup was already being cached by hostname, so the table had quietly become a dataset. It
is now public: `policy.ledger` is a reactive query behind a block on the landing page listing every
company anyone has asked it to read, what it found, and a link to the page it read it from. A
lookup run on the same screen joins the list without a refresh.

Pointed at 27 well-known companies, the finding is the thesis with a number on it: **15 of 27
publish no refund deadline at all.** Sky, Vodafone, Currys, HSBC, Nationwide, Uber, Deliveroo,
British Airways and easyJet give you nothing to hold them to. Of the twelve that do, the middle
promise is 14 days, from Next's one working day to Airbnb's fifteen. A company that never names a
date can never be late.

> **This number was wrong, and the next day's entry is the correction.** Reading each company a
> second time found a published deadline on eight of the fifteen. The real figure is 20 of 28.
> Left standing here because a build log that quietly edits yesterday's claim is worth less than
> one that shows where it was wrong.

Getting there meant six more rounds of the extractor being wrong on real pages, each one found by
running it rather than reading it, and each one a fixture before it was a fix (41 cases now):

- IKEA's "you can return new and unopened products **within 365 days**" — the reader's window,
  offered rather than obliged, so `ON_YOU` never saw it. A year, onto a claim.
- easyJet's "a refund or flight voucher ... **to be used within six months**" — a voucher's shelf
  life. Guarded by the verb sitting in front of the duration, plus a flat rule that a voucher is
  not your money back.
- H&M's "within 30 days **of the purchase date**" — a return window that slipped the backward
  guard on the word "the".
- Apple's "**Mobile phone billing** — up to 60 days for the statement to show the refund" — the
  carrier's clock.
- Airbnb's "**Card approval** cancellation within 3-5 business days" — an authorisation hold
  releasing, which is the card network.
- Sky's "**@Carla1984** Automatic refunds can take 6 weeks" — a community forum post, on Sky's own
  domain, ranking well. Anything a stranger can post is not a commitment, so community and forum
  URLs are now excluded at the source, and candidate pages are ranked so the one whose address
  says "refunds" is read first — which also stops the answer drifting day to day as search
  rankings move.

Two structural repairs came out of it. `policy.store` listed every field instead of spreading
`args`, because a re-read that finds nothing must *clear* the old answer and `{...args}` drops
absent keys — the ledger had been republishing numbers the page no longer supported. And
`policy.ledger` now returns only rows written by the current extractor version, so improving the
rules retires the old readings instead of leaving them on a public page.

`policy.sweep` is an internal action that refreshes the ledger without the cache or the public
rate limit. That limit exists for good reason, but applied to an admin re-read of thirty companies
it turns into thirty refusals that look exactly like "they publish nothing" — which is how the
first pass produced a table nobody should have trusted.

### 2026-09-20 - working tree

Yesterday's headline number was wrong, and finding that out is most of this entry.

`policy.sweep` was pointed at companies the ledger listed as publishing nothing. Eight of them —
Currys, Apple, Samsung, Wayfair, EE, H&M, HSBC and Nationwide — turned out to publish a deadline
after all, in their own words, on their own pages:

- Apple: *"Apple will mail a refund check to you within 10 business days."*
- Currys: *"we refund you as soon as possible and within 14 days of you telling us…"*
- HSBC: 5 working days. Nationwide: 14 days. H&M: 14 days. Wayfair: 14 business days.

Nothing had changed on their side. Search does not return the same pages twice, so a single read
of a company is a sample, not an answer — and the first sample had been published as though it
were one. The corrected ledger reads **20 of 28 publish a deadline, 8 do not**, median still 14
days. That inverts the claim the product was making: the deadline usually exists, and the problem
is that nobody reads it — which is a better argument for the product than the one it replaced,
and the only reason to prefer it is that it is true.

Three changes came out of it, and two of them are guards rather than features.

**The ledger is now re-read on a schedule.** `convex/crons.ts` runs `policy.daily` every morning;
`policy.due` hands it the companies whose reading has passed `FRESH_MS`, capped at eight a day.
The cap is deliberate — a policy page is somebody's server, and reading all of them every morning
is a machine being rude — and the staleness threshold is the same one the public reader already
uses to stop trusting a cached answer, so no row on the page is ever older than it claims.

**A change is only recorded when the same page says something different.** `policyChanges` keeps
what a company used to promise, because they overwrite it and nobody else keeps the old sentence.
But `policy.store` writes a row only when the reading came from the same URL, under the same
extractor version, with both sides carrying a number. Without the URL guard, reading a returns
page one week and a terms page the next would publish *"they moved their deadline"* about a
company that had done nothing — an invented accusation against a real business, on a public page,
which is the exact move this product exists to argue against. A number that merely stops being
findable is not recorded either, for the same reason the eight above were not a change.

`experiments/policy-change.test.mjs` covers the rule in 13 cases, and the ones that matter are the
negatives: a different page of the same site, a row from an older extractor version, a page
reworded around the same number, a company that published nothing before.

The landing page now carries the changelog under the ledger. It is empty, and it says so, with the
date it has been watching since — an empty changelog that does not say what it is watching for
reads as not looking.
