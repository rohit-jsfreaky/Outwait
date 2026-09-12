# Hackathon log

- **Project:** Outwait
- **Event:** Convex All Gas Hackathon sponsored by OpenAI, Firecrawl, & AgentMail
- **What it does:** Works a stuck admin case for weeks — fills the web forms itself, chases by email, and asks a human only for the ten seconds only a human can do.
- **Live app:** https://tangible-finch-783.convex.site
- **Repo:** https://github.com/rohit-jsfreaky/Outwait
- **Frontend:** Convex static hosting
- **Convex deployment:** https://tangible-finch-783.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** schema, indexes, queries, mutations, internal functions, actions, HTTP actions, scheduled functions, realtime queries
- **Auth:** none
- **AI models:** openai/gpt-5.6-luna (via OpenRouter)
- **Started:** 2026-09-12T09:10:36Z
- **Last updated:** 2026-09-12T11:20:00Z

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

### 2026-09-12 - working tree

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
