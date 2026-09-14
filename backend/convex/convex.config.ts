import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config.js";

// Your own HTTP endpoints (convex/http.ts) are served under /api so the
// static site can own the root.
const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });

// Durable workflows. A chase runs for weeks: send, wait 7 days, follow up,
// wait again, escalate. A workflow survives restarts and sleeps for free.
app.use(workflow);

export default app;
