import { randomToken } from "../security/crypto.js";

export type DevicePair = {
  code: string;
  createdBy: string;
  expiresAt: number;
};

const pairs = new Map<string, DevicePair>();

export function createDevicePair(userId: string, ttlMinutes = 20): DevicePair {
  // purge expired
  const now = Date.now();
  for (const [code, pair] of pairs) {
    if (pair.expiresAt < now) pairs.delete(code);
  }
  const code = randomToken(4).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  const pair: DevicePair = {
    code,
    createdBy: userId,
    expiresAt: now + ttlMinutes * 60_000,
  };
  pairs.set(code, pair);
  return pair;
}

export function peekDevicePair(code: string): DevicePair {
  const normalized = code.trim().toUpperCase();
  const pair = pairs.get(normalized);
  if (!pair || pair.expiresAt < Date.now()) {
    pairs.delete(normalized);
    throw new Error("Pair code invalid or expired — generate a new one in Autopilot");
  }
  return pair;
}

export function consumeDevicePair(code: string): DevicePair {
  const pair = peekDevicePair(code);
  pairs.delete(pair.code);
  return pair;
}
