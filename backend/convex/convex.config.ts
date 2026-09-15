import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";

// App-owned root routing. The component's own HTTP mount is left off and the
// static catch-all is registered inside convex/http.ts instead, because Convex
// Auth must serve /.well-known/openid-configuration and /.well-known/jwks.json
// from the ROOT — the token's `iss` claim is CONVEX_SITE_URL with no prefix, so
// discovery under /api would never be found.
//
// Exact routes win over the catch-all, so the AgentMail webhook keeps its
// existing /api/agentmail/webhook URL and nothing has to be re-registered.
const app = defineApp();
app.use(staticHosting);

// Durable workflows. A chase runs for weeks: send, wait 7 days, follow up,
// wait again, escalate. A workflow survives restarts and sleeps for free.
app.use(workflow);

// Who else is on this case right now, and who is driving a handover.
// A shared case is the flatmate story: three people, one deposit.
app.use(presence);

export default app;
