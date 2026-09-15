# Hackathon log

- **Project:** Outwait
- **Event:** Convex All Gas Hackathon sponsored by OpenAI, Firecrawl, & AgentMail
- **What it does:** Works a stuck admin case for weeks — fills the web forms itself, chases by email, and asks a human only for the ten seconds only a human can do.
- **Live app:** https://tangible-finch-783.convex.site
- **Repo:** https://github.com/rohit-jsfreaky/Outwait
- **Frontend:** Convex static hosting
- **Convex deployment:** https://tangible-finch-783.convex.cloud
- **Components:** @convex-dev/static-hosting, @convex-dev/workflow, @convex-dev/presence
- **Convex features:** schema, tables, indexes, queries, mutations, internal functions, actions, HTTP actions, scheduled functions, file storage, realtime queries
- **Auth:** Convex Auth
- **AI models:** openai/gpt-5.6-luna (via OpenRouter)
- **Started:** 2026-09-12T09:10:36Z
- **Last updated:** 2026-09-15T10:33:15Z

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
