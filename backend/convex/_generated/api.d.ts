/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agent_decide from "../agent/decide.js";
import type * as agent_extract from "../agent/extract.js";
import type * as agent_model from "../agent/model.js";
import type * as agentMailOtp from "../agentMailOtp.js";
import type * as asks from "../asks.js";
import type * as auth from "../auth.js";
import type * as browser_firecrawl from "../browser/firecrawl.js";
import type * as browser_research from "../browser/research.js";
import type * as browser_signup from "../browser/signup.js";
import type * as cases from "../cases.js";
import type * as drafts from "../drafts.js";
import type * as handoffs from "../handoffs.js";
import type * as http from "../http.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_svix from "../lib/svix.js";
import type * as mail_client from "../mail/client.js";
import type * as mail_inbound from "../mail/inbound.js";
import type * as mail_otp from "../mail/otp.js";
import type * as mail_replies from "../mail/replies.js";
import type * as members from "../members.js";
import type * as presence from "../presence.js";
import type * as tracks from "../tracks.js";
import type * as users from "../users.js";
import type * as workflows_chase from "../workflows/chase.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "agent/decide": typeof agent_decide;
  "agent/extract": typeof agent_extract;
  "agent/model": typeof agent_model;
  agentMailOtp: typeof agentMailOtp;
  asks: typeof asks;
  auth: typeof auth;
  "browser/firecrawl": typeof browser_firecrawl;
  "browser/research": typeof browser_research;
  "browser/signup": typeof browser_signup;
  cases: typeof cases;
  drafts: typeof drafts;
  handoffs: typeof handoffs;
  http: typeof http;
  "lib/status": typeof lib_status;
  "lib/svix": typeof lib_svix;
  "mail/client": typeof mail_client;
  "mail/inbound": typeof mail_inbound;
  "mail/otp": typeof mail_otp;
  "mail/replies": typeof mail_replies;
  members: typeof members;
  presence: typeof presence;
  tracks: typeof tracks;
  users: typeof users;
  "workflows/chase": typeof workflows_chase;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
