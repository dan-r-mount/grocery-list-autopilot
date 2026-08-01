import { existsSync, readFileSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import {
  dataPath,
  decryptWithPassphrase,
  encryptWithPassphrase,
} from "./crypto.js";

export type SainsburysSession = {
  cookies: Array<{
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
  }>;
  /** Auth token header used by Sainsbury's grocery APIs when present */
  wcAuthToken?: string;
  capturedAt: string;
  label?: string;
};

type MemoryUnlock = {
  session: SainsburysSession;
  unlockedAt: number;
  ttlMs: number;
};

let memory: MemoryUnlock | null = null;

function vaultFile() {
  return dataPath("sainsburys.vault");
}

export function vaultStatus() {
  const onDisk = existsSync(vaultFile());
  const unlocked =
    !!memory && Date.now() - memory.unlockedAt < memory.ttlMs;
  if (memory && !unlocked) memory = null;
  return {
    hasVault: onDisk,
    unlocked,
    capturedAt: unlocked ? memory!.session.capturedAt : null,
    label: unlocked ? memory!.session.label ?? null : null,
  };
}

export function getUnlockedSession(): SainsburysSession | null {
  const status = vaultStatus();
  if (!status.unlocked || !memory) return null;
  return memory.session;
}

export function lockVault() {
  memory = null;
}

export function disconnectVault() {
  memory = null;
  const file = vaultFile();
  if (existsSync(file)) unlinkSync(file);
}

export function saveSessionWithPassphrase(
  session: SainsburysSession,
  passphrase: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
) {
  if (passphrase.length < 8) {
    throw new Error("Vault passphrase must be at least 8 characters");
  }
  const blob = encryptWithPassphrase(JSON.stringify(session), passphrase);
  const file = vaultFile();
  writeFileSync(file, blob);
  try {
    chmodSync(file, 0o600);
  } catch {
    // ignore
  }
  memory = { session, unlockedAt: Date.now(), ttlMs };
}

export function unlockVault(passphrase: string, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const file = vaultFile();
  if (!existsSync(file)) throw new Error("No Sainsbury's vault — connect first");
  const blob = readFileSync(file);
  try {
    const session = JSON.parse(decryptWithPassphrase(blob, passphrase)) as SainsburysSession;
    memory = { session, unlockedAt: Date.now(), ttlMs };
    return vaultStatus();
  } catch {
    throw new Error("Wrong vault passphrase (or corrupt vault)");
  }
}
