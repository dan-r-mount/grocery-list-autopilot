import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Verifies the persistent-profile auth path: a profile can be created, its
 * status reported, and fully removed. Sainsbury's itself may block non-UK
 * networks, which the login snapshot reports rather than throwing.
 */
async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "gla-profile-"));
  process.env.GLA_DATA_DIR = dir;

  const { profileStatus, startProfileLogin, forgetProfile, closeProfileContext } =
    await import("../sainsburys/profile.js");

  const before = await profileStatus();
  assert.equal(before.exists, false);
  assert.equal(before.loggedIn, false);

  let snapshotStatus = "not_started";
  try {
    const snapshot = await startProfileLogin();
    snapshotStatus = snapshot.status;
    assert.ok(["awaiting_login", "blocked", "logged_in"].includes(snapshot.status));
  } catch (err) {
    // A hard network failure is acceptable here; a bot block is reported in-band.
    snapshotStatus = `error: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}`;
  }

  const after = await profileStatus();
  assert.equal(after.exists, true, "profile directory should exist after login start");

  await closeProfileContext();
  await forgetProfile();
  assert.equal((await profileStatus()).exists, false, "profile should be removable");

  rmSync(dir, { recursive: true, force: true });
  console.log(`persistent profile ok (login snapshot: ${snapshotStatus})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
