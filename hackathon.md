# Hackathon log

- **Project:** Outwait
- **Event:** Convex All Gas Hackathon sponsored by OpenAI, Firecrawl, & AgentMail
- **What it does:** Works a stuck admin case for weeks — fills the web forms itself, chases by email, and asks a human only for the ten seconds only a human can do.
- **Live app:** https://tangible-finch-783.convex.site
- **Repo:** https://github.com/rohit-jsfreaky/Outwait
- **Frontend:** Convex static hosting
- **Convex deployment:** https://tangible-finch-783.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** schema, queries, realtime queries
- **Auth:** none
- **AI models:** none
- **Started:** 2026-09-12T09:10:36Z
- **Last updated:** 2026-09-12T10:20:00Z

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
