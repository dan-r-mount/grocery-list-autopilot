import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
  type CredentialDeviceType,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { dataPath, randomToken } from "./crypto.js";

export type StoredCredential = {
  id: string;
  publicKey: string; // base64url
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType?: CredentialDeviceType;
  backedUp?: boolean;
};

export type HouseholdUser = {
  id: string;
  displayName: string;
  credentials: StoredCredential[];
  createdAt: string;
};

export type PartnerInvite = {
  code: string;
  expiresAt: string;
  createdBy: string;
};

type HouseholdStore = {
  users: HouseholdUser[];
  invites: PartnerInvite[];
};

type ChallengeRecord = {
  challenge: string;
  userId?: string;
  purpose: "registration" | "authentication";
  expiresAt: number;
};

const challenges = new Map<string, ChallengeRecord>();

function storePath() {
  return dataPath("household.json");
}

function load(): HouseholdStore {
  const file = storePath();
  if (!existsSync(file)) return { users: [], invites: [] };
  return JSON.parse(readFileSync(file, "utf8")) as HouseholdStore;
}

function save(store: HouseholdStore) {
  writeFileSync(storePath(), JSON.stringify(store, null, 2));
}

export function householdStatus() {
  const store = load();
  return {
    bootstrapped: store.users.length > 0,
    memberCount: store.users.length,
  };
}

export function listUsers() {
  return load().users.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    passkeyCount: u.credentials.length,
  }));
}

function purgeExpiredInvites(store: HouseholdStore) {
  const now = Date.now();
  store.invites = store.invites.filter((i) => Date.parse(i.expiresAt) > now);
}

function rpFromRequest(origin: string, hostHeader: string | undefined) {
  const url = new URL(origin);
  // Prefer explicit host when behind a tunnel; fall back to origin hostname.
  const rpID = (hostHeader ?? url.hostname).split(":")[0]!;
  return { rpID, rpName: "Grocery List Autopilot", origin: url.origin };
}

export async function beginRegistration(opts: {
  displayName: string;
  origin: string;
  host?: string;
  inviteCode?: string;
  existingUserId?: string;
}) {
  const store = load();
  purgeExpiredInvites(store);

  const isBootstrap = store.users.length === 0;
  let user: HouseholdUser | undefined;

  if (isBootstrap) {
    user = {
      id: randomToken(16),
      displayName: opts.displayName || "Household owner",
      credentials: [],
      createdAt: new Date().toISOString(),
    };
  } else if (opts.existingUserId) {
    user = store.users.find((u) => u.id === opts.existingUserId);
    if (!user) throw new Error("User not found");
  } else if (opts.inviteCode) {
    const invite = store.invites.find((i) => i.code === opts.inviteCode);
    if (!invite || Date.parse(invite.expiresAt) < Date.now()) {
      throw new Error("Invite code invalid or expired");
    }
    user = {
      id: randomToken(16),
      displayName: opts.displayName || "Partner",
      credentials: [],
      createdAt: new Date().toISOString(),
    };
  } else {
    throw new Error("Household already set up — sign in or use a partner invite");
  }

  const { rpID, rpName, origin } = rpFromRequest(opts.origin, opts.host);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.displayName,
    userDisplayName: user.displayName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: user.credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });

  const challengeId = randomToken(12);
  challenges.set(challengeId, {
    challenge: options.challenge,
    userId: user.id,
    purpose: "registration",
    expiresAt: Date.now() + 5 * 60_000,
  });

  // Stash pending user for bootstrap/invite completion
  pendingUsers.set(challengeId, {
    user,
    inviteCode: opts.inviteCode,
    origin,
    rpID,
  });

  return { challengeId, options, bootstrap: isBootstrap };
}

const pendingUsers = new Map<
  string,
  { user: HouseholdUser; inviteCode?: string; origin: string; rpID: string }
>();

export async function finishRegistration(opts: {
  challengeId: string;
  response: RegistrationResponseJSON;
}) {
  const challenge = challenges.get(opts.challengeId);
  const pending = pendingUsers.get(opts.challengeId);
  if (!challenge || !pending || challenge.expiresAt < Date.now()) {
    throw new Error("Registration challenge expired");
  }

  const verification = await verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: pending.origin,
    expectedRPID: pending.rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey registration failed verification");
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const store = load();
  let user = store.users.find((u) => u.id === pending.user.id);
  if (!user) {
    user = pending.user;
    store.users.push(user);
  }

  user.credentials.push({
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  });

  if (pending.inviteCode) {
    store.invites = store.invites.filter((i) => i.code !== pending.inviteCode);
  }

  save(store);
  challenges.delete(opts.challengeId);
  pendingUsers.delete(opts.challengeId);

  return { userId: user.id, displayName: user.displayName };
}

export async function beginAuthentication(opts: {
  origin: string;
  host?: string;
}) {
  const store = load();
  if (!store.users.length) throw new Error("No household passkeys registered yet");

  const { rpID, origin } = rpFromRequest(opts.origin, opts.host);
  const allowCredentials = store.users.flatMap((u) =>
    u.credentials.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
  );

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: "preferred",
  });

  const challengeId = randomToken(12);
  challenges.set(challengeId, {
    challenge: options.challenge,
    purpose: "authentication",
    expiresAt: Date.now() + 5 * 60_000,
  });
  pendingAuth.set(challengeId, { origin, rpID });

  return { challengeId, options };
}

const pendingAuth = new Map<string, { origin: string; rpID: string }>();

export async function finishAuthentication(opts: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}) {
  const challenge = challenges.get(opts.challengeId);
  const pending = pendingAuth.get(opts.challengeId);
  if (!challenge || !pending || challenge.expiresAt < Date.now()) {
    throw new Error("Sign-in challenge expired");
  }

  const store = load();
  let matched: { user: HouseholdUser; cred: StoredCredential } | undefined;
  for (const user of store.users) {
    const cred = user.credentials.find((c) => c.id === opts.response.id);
    if (cred) {
      matched = { user, cred };
      break;
    }
  }
  if (!matched) throw new Error("Unknown passkey");

  const verification = await verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: pending.origin,
    expectedRPID: pending.rpID,
    credential: {
      id: matched.cred.id,
      publicKey: Buffer.from(matched.cred.publicKey, "base64url"),
      counter: matched.cred.counter,
      transports: matched.cred.transports,
    },
  });

  if (!verification.verified) throw new Error("Passkey sign-in failed");

  matched.cred.counter = verification.authenticationInfo.newCounter;
  save(store);
  challenges.delete(opts.challengeId);
  pendingAuth.delete(opts.challengeId);

  return { userId: matched.user.id, displayName: matched.user.displayName };
}

export function createPartnerInvite(createdBy: string, ttlMinutes = 60) {
  const store = load();
  purgeExpiredInvites(store);
  const invite: PartnerInvite = {
    code: randomToken(6).slice(0, 8).toLowerCase(),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    createdBy,
  };
  store.invites.push(invite);
  save(store);
  return invite;
}
