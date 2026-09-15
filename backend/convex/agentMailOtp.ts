import { Email } from "@convex-dev/auth/providers/Email";
import { sendMessage } from "./mail/client";

/**
 * Signing in, by email code, sent from the agent's own inbox.
 *
 * There is no password anywhere in this product. That is not a shortcut — the
 * whole thesis is that a person who has given up on a deposit will never come
 * back to a website, but will read an email on their phone. Signing in the same
 * way the product already reaches you is the honest version of that, and it
 * means the address you sign in with is by definition an address that works,
 * which is the one thing the agent actually needs from you.
 *
 * Convex Auth handles issuing, hashing, expiry and rate-limiting the code. All
 * this provider decides is how the code is generated and how it is delivered.
 */
export const AgentMailOTP = Email({
  id: "agentmail-otp",

  // Long enough to go and find the mail on another device, short enough that a
  // code left in an inbox is not a standing key to the account.
  maxAge: 60 * 15,

  async generateVerificationToken() {
    // Six digits, uniformly drawn. `% 10` over a Uint32 is a negligible bias
    // (2^32 is not a multiple of 10, but the skew is ~2e-9 per digit) and this
    // is a 15-minute, rate-limited, single-use code.
    const bytes = new Uint32Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (n) => (n % 10).toString()).join("");
  },

  async sendVerificationRequest({ identifier: email, token }) {
    await sendMessage({
      to: [email],
      // The code goes in the subject as well as the body. Phones show the
      // subject on the lock screen, so most people never open the mail.
      subject: `${token} is your Outwait sign-in code`,
      text: [
        `Your sign-in code is ${token}`,
        ``,
        `It works once, and it expires in 15 minutes.`,
        ``,
        `If you did not ask to sign in, you can ignore this — somebody typed`,
        `your address and nothing has happened to your account.`,
        ``,
        `— Outwait`,
      ].join("\n"),
      labels: ["auth"],
    });
  },
});
