import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "gla-vault-"));
  process.env.GLA_DATA_DIR = dir;

  const { encryptWithPassphrase, decryptWithPassphrase } = await import(
    "../security/crypto.js"
  );
  const {
    saveSessionWithPassphrase,
    unlockVault,
    vaultStatus,
    disconnectVault,
    getUnlockedSession,
    lockVault,
  } = await import("../security/vault.js");

  const roundtrip = decryptWithPassphrase(
    encryptWithPassphrase("hello-vault", "passphrase-ok"),
    "passphrase-ok",
  );
  assert.equal(roundtrip, "hello-vault");

  saveSessionWithPassphrase(
    {
      cookies: [{ name: "a", value: "b" }],
      capturedAt: new Date().toISOString(),
      label: "test",
    },
    "passphrase-ok",
  );

  assert.equal(vaultStatus().hasVault, true);
  assert.equal(vaultStatus().unlocked, true);
  assert.equal(getUnlockedSession()?.cookies[0]?.value, "b");

  disconnectVault();
  assert.equal(vaultStatus().hasVault, false);

  saveSessionWithPassphrase(
    {
      cookies: [{ name: "a", value: "b" }],
      capturedAt: new Date().toISOString(),
    },
    "passphrase-ok",
  );
  lockVault();
  assert.equal(vaultStatus().unlocked, false);
  unlockVault("passphrase-ok");
  assert.equal(vaultStatus().unlocked, true);

  rmSync(dir, { recursive: true, force: true });
  console.log("vault crypto ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
