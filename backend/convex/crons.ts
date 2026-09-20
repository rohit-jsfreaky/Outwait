import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * The ledger is a thing being watched, not a thing that was read once.
 *
 * A refund policy is a live page. A company can move its own deadline from 14
 * days to 30 overnight, the old sentence leaves the web, and the person
 * arguing about a claim opened last month has nothing left to point at. This
 * pass re-reads the oldest answers every morning and keeps what changed.
 *
 * 06:20 UTC, before the UK working day, so a company's page is read when
 * nobody is being served by it.
 */
const crons = cronJobs();

crons.daily(
  "re-read the oldest policies",
  { hourUTC: 6, minuteUTC: 20 },
  internal.policy.daily,
);

export default crons;
