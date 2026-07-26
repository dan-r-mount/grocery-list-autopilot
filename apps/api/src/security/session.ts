import { getOrCreateSessionSecret, signPayload, verifyPayload } from "./crypto.js";

export type AppSession = {
  userId: string;
  displayName: string;
  exp: number;
};

const COOKIE = "gla_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionCookieName() {
  return COOKIE;
}

export function createSessionToken(userId: string, displayName: string): string {
  const secret = getOrCreateSessionSecret();
  const payload: AppSession = {
    userId,
    displayName,
    exp: Date.now() + TTL_MS,
  };
  return signPayload(JSON.stringify(payload), secret);
}

export function readSessionToken(token: string | undefined): AppSession | null {
  if (!token) return null;
  const secret = getOrCreateSessionSecret();
  const raw = verifyPayload(token, secret);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AppSession;
    if (session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: TTL_MS / 1000,
  };
}
