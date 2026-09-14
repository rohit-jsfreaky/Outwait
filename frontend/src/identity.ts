/**
 * Who you are, for presence and for approving things.
 *
 * Deliberately not an account. The whole product reaches people by email and
 * never makes them visit anything, so someone can be useful on a case without
 * ever creating a login. This is the same idea inside the app: tell it your
 * address once, and it remembers.
 */
const KEY = "outwait.me";

export function getMe(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setMe(email: string): void {
  try {
    localStorage.setItem(KEY, email.trim().toLowerCase());
  } catch {
    // Private windows block storage. Presence just falls back to a guest name.
  }
}

export function meOrGuest(): string {
  return getMe() ?? `guest-${Math.floor(Math.random() * 9000 + 1000)}`;
}
