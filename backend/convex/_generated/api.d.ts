/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_extract from "../agent/extract.js";
import type * as agent_model from "../agent/model.js";
import type * as asks from "../asks.js";
import type * as browser_firecrawl from "../browser/firecrawl.js";
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

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/extract": typeof agent_extract;
  "agent/model": typeof agent_model;
  asks: typeof asks;
  "browser/firecrawl": typeof browser_firecrawl;
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
};
