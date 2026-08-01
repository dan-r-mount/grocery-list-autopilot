import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../");
const DATA_DIR = process.env.GLA_DATA_DIR ?? path.join(REPO_ROOT, "data");

export function ensureDataDir(): string {
  mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function dataPath(...parts: string[]): string {
  return path.join(ensureDataDir(), ...parts);
}

/** Server-side cookie signing secret — generated once, never committed. */
export function getOrCreateSessionSecret(): Buffer {
  const file = dataPath("session-secret");
  if (existsSync(file)) {
    return readFileSync(file);
  }
  const secret = randomBytes(32);
  writeFileSync(file, secret);
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
  return secret;
}

export function deriveVaultKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

/** AES-256-GCM blob: salt(16) | iv(12) | tag(16) | ciphertext */
export function encryptWithPassphrase(plaintext: string, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveVaultKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, enc]);
}

export function decryptWithPassphrase(blob: Buffer, passphrase: string): string {
  const salt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(28, 44);
  const ciphertext = blob.subarray(44);
  const key = deriveVaultKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString("utf8");
}

export function signPayload(payload: string, secret: Buffer): string {
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}

export function verifyPayload(token: string, secret: Buffer): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret)
    .update(Buffer.from(body, "base64url").toString("utf8"))
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
