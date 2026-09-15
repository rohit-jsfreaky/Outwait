import { convexAuth } from "@convex-dev/auth/server";
import { AgentMailOTP } from "./agentMailOtp";

/**
 * One sign-in method, and it is email. See ./agentMailOtp.ts for why.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [AgentMailOTP],
});
