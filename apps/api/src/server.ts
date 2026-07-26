import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { createDefaultServices } from "./adapters.js";
import { resolveOpenItems, runWeeklyPush } from "./jobs/weekly-push.js";
import {
  beginAuthentication,
  beginRegistration,
  createPartnerInvite,
  finishAuthentication,
  finishRegistration,
  householdStatus,
  listUsers,
} from "./security/household.js";
import {
  createSessionToken,
  readSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "./security/session.js";
import {
  disconnectVault,
  lockVault,
  unlockVault,
  vaultStatus,
} from "./security/vault.js";
import { loadSettings, saveSettings } from "./security/settings.js";
import { sendTestNotification } from "./notify/ntfy.js";
import {
  closeConnect,
  completeConnect,
  connectSnapshot,
  connectTap,
  connectType,
  saveDemoSession,
  startConnect,
} from "./sainsburys/connect.js";

const services = await createDefaultServices();
const app = new Hono();

function requestOrigin(c: { req: { header: (n: string) => string | undefined } }) {
  return (
    c.req.header("origin") ??
    c.req.header("x-forwarded-origin") ??
    process.env.WEB_ORIGIN ??
    "http://localhost:3000"
  );
}

function isSecureRequest(c: { req: { header: (n: string) => string | undefined; url: string } }) {
  const proto = c.req.header("x-forwarded-proto");
  if (proto) return proto === "https";
  return c.req.url.startsWith("https://");
}

function currentUser(c: { req: { header: (n: string) => string | undefined } }) {
  return readSessionToken(getCookie(c as never, sessionCookieName()));
}

function requireUser(c: Parameters<typeof currentUser>[0]) {
  const user = currentUser(c);
  if (!user) throw new Error("Sign in with your passkey first");
  return user;
}

app.use(
  "*",
  cors({
    origin: (origin) => origin || process.env.WEB_ORIGIN || "http://localhost:3000",
    credentials: true,
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "grocery-list-autopilot-api",
    household: householdStatus(),
    sainsburys: vaultStatus(),
  }),
);

app.get("/api/auth/status", (c) => {
  const user = currentUser(c);
  return c.json({
    ...householdStatus(),
    members: listUsers(),
    user,
    sainsburys: vaultStatus(),
    settings: user ? loadSettings() : null,
    secureContextHint: {
      needsHttpsForPasskeys: true,
      howToTestOnPixel: "On a computer run: pnpm mobile — then open the printed https:// URL in Pixel Chrome. Do not run pnpm on the phone.",
    },
  });
});

app.post("/api/auth/register/options", async (c) => {
  const body = await c.req.json<{
    displayName?: string;
    inviteCode?: string;
  }>();
  const user = currentUser(c);
  try {
    const result = await beginRegistration({
      displayName: body.displayName ?? "Household member",
      origin: requestOrigin(c),
      host: c.req.header("x-forwarded-host") ?? c.req.header("host"),
      inviteCode: body.inviteCode,
      existingUserId: user?.userId,
    });
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/auth/register/verify", async (c) => {
  const body = await c.req.json<{ challengeId: string; response: never }>();
  try {
    const result = await finishRegistration(body);
    const token = createSessionToken(result.userId, result.displayName);
    setCookie(c, sessionCookieName(), token, sessionCookieOptions(isSecureRequest(c)));
    return c.json({ ok: true, user: result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/auth/login/options", async (c) => {
  try {
    const result = await beginAuthentication({
      origin: requestOrigin(c),
      host: c.req.header("x-forwarded-host") ?? c.req.header("host"),
    });
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/auth/login/verify", async (c) => {
  const body = await c.req.json<{ challengeId: string; response: never }>();
  try {
    const result = await finishAuthentication(body);
    const token = createSessionToken(result.userId, result.displayName);
    setCookie(c, sessionCookieName(), token, sessionCookieOptions(isSecureRequest(c)));
    return c.json({ ok: true, user: result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, sessionCookieName(), { path: "/" });
  return c.json({ ok: true });
});

app.post("/api/auth/invite", (c) => {
  try {
    const user = requireUser(c);
    const invite = createPartnerInvite(user.userId);
    return c.json({ invite });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.get("/api/settings", (c) => {
  try {
    requireUser(c);
    return c.json({ settings: loadSettings() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.put("/api/settings", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json<{ ntfyTopic?: string; ntfyServer?: string }>();
    const settings = saveSettings({
      ntfyTopic: body.ntfyTopic,
      ntfyServer: body.ntfyServer,
    });
    return c.json({ settings });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/notify/test", async (c) => {
  try {
    requireUser(c);
    const result = await sendTestNotification();
    return c.json(result, result.ok ? 200 : 400);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.get("/api/sainsburys/status", (c) => {
  try {
    requireUser(c);
    return c.json(vaultStatus());
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/sainsburys/unlock", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json<{ passphrase: string }>();
    const status = unlockVault(body.passphrase ?? "");
    return c.json({ ok: true, status });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/sainsburys/lock", (c) => {
  try {
    requireUser(c);
    lockVault();
    return c.json({ ok: true, status: vaultStatus() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/sainsburys/disconnect", (c) => {
  try {
    requireUser(c);
    disconnectVault();
    return c.json({ ok: true, status: vaultStatus() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/sainsburys/connect/start", async (c) => {
  try {
    requireUser(c);
    const result = await startConnect();
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.get("/api/sainsburys/connect/:id", async (c) => {
  try {
    requireUser(c);
    return c.json(await connectSnapshot(c.req.param("id")));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/sainsburys/connect/:id/tap", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json<{ x: number; y: number }>();
    return c.json(await connectTap(c.req.param("id"), body.x, body.y));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/sainsburys/connect/:id/type", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json<{ text: string; submit?: boolean }>();
    return c.json(await connectType(c.req.param("id"), body.text, body.submit));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/sainsburys/connect/:id/save", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json<{ passphrase: string }>();
    const session = await completeConnect(c.req.param("id"), body.passphrase ?? "");
    return c.json({ ok: true, session, status: vaultStatus() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.post("/api/sainsburys/connect/:id/close", async (c) => {
  try {
    requireUser(c);
    await closeConnect(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/sainsburys/demo-vault", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json<{ passphrase: string }>();
    const view = saveDemoSession(body.passphrase ?? "");
    return c.json({ ok: true, view, status: vaultStatus() });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.get("/api/list", async (c) => {
  try {
    requireUser(c);
    const items = await services.list.pullOpenItems();
    return c.json({ items });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.get("/api/resolutions", async (c) => {
  try {
    requireUser(c);
    const resolutions = await resolveOpenItems(services);
    return c.json({ resolutions });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.get("/api/runs", (c) => {
  try {
    requireUser(c);
    return c.json({ runs: services.runs });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/runs/weekly", async (c) => {
  try {
    requireUser(c);
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    if (!dryRun && !vaultStatus().unlocked) {
      return c.json(
        {
          error:
            "Sainsbury's vault is locked. Unlock with your passphrase (or reconnect) before a live push.",
        },
        403,
      );
    }
    const run = await runWeeklyPush(services, { dryRun });
    return c.json({ run });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

app.post("/api/runs/:id/signoff", async (c) => {
  try {
    requireUser(c);
    const id = c.req.param("id");
    const run = services.runs.find((r) => r.id === id);
    if (!run) return c.json({ error: "run not found" }, 404);

    for (const line of run.lines) {
      if (line.result === "added" || line.result === "would_add") {
        await services.prefs.recordConfirmation(
          line.rawText.toLowerCase(),
          line.productUid,
          line.qty,
          { kind: "unknown" },
        );
      }
    }

    return c.json({
      ok: true,
      message:
        "Preferences updated from sign-off. Complete checkout on Sainsbury's if this was a live run.",
      run,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 401);
  }
});

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? "0.0.0.0";
console.log(`API listening on http://${hostname}:${port}`);

serve({ fetch: app.fetch, port, hostname });
