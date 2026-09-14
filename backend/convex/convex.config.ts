import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";

// Your own HTTP endpoints (convex/http.ts) are served under /api so the
// static site can own the root.
const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });

// Durable workflows. A chase runs for weeks: send, wait 7 days, follow up,
// wait again, escalate. A workflow survives restarts and sleeps for free.
app.use(workflow);

// Who else is on this case right now, and who is driving a handover.
// A shared case is the flatmate story: three people, one deposit.
app.use(presence);

export default app;
