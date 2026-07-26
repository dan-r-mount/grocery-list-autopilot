import { randomToken } from "../security/crypto.js";
import {
  saveSessionWithPassphrase,
  type SainsburysSession,
} from "../security/vault.js";

type ConnectState = {
  id: string;
  createdAt: number;
  status: "starting" | "awaiting_login" | "capturing" | "completed" | "failed" | "closed";
  error?: string;
  lastScreenshot?: string; // base64 jpeg
  pageUrl?: string;
  browser?: import("playwright").Browser;
  page?: import("playwright").Page;
};

const sessions = new Map<string, ConnectState>();

const LOGIN_URL = "https://www.sainsburys.co.uk/gol-ui/Hello";

export function getConnect(id: string) {
  return sessions.get(id);
}

export async function startConnect(): Promise<{ id: string; mode: "live" | "unavailable"; message: string }> {
  const id = randomToken(12);
  const state: ConnectState = {
    id,
    createdAt: Date.now(),
    status: "starting",
  };
  sessions.set(id, state);

  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
    });
    state.browser = browser;
    state.page = page;
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    state.status = "awaiting_login";
    state.pageUrl = page.url();
    await refreshScreenshot(state);
    return {
      id,
      mode: "live",
      message:
        "Live Sainsbury's browser started. Sign in on the Pixel view (including MFA), then tap Save session.",
    };
  } catch (err) {
    state.status = "unavailable" as ConnectState["status"];
    state.error =
      err instanceof Error
        ? err.message
        : "Playwright unavailable — run: pnpm --filter @gla/api exec playwright install chromium";
    // Use failed status for typing
    state.status = "failed";
    return {
      id,
      mode: "unavailable",
      message:
        "Live browser could not start. Install Chromium for Playwright, or use the guided checklist on the phone UI.",
    };
  }
}

async function refreshScreenshot(state: ConnectState) {
  if (!state.page) return;
  const buf = await state.page.screenshot({ type: "jpeg", quality: 55 });
  state.lastScreenshot = buf.toString("base64");
  state.pageUrl = state.page.url();
}

export async function connectSnapshot(id: string) {
  const state = sessions.get(id);
  if (!state) throw new Error("Connect session not found");
  if (state.page && state.status === "awaiting_login") {
    try {
      await refreshScreenshot(state);
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    id: state.id,
    status: state.status,
    error: state.error,
    pageUrl: state.pageUrl,
    screenshotDataUrl: state.lastScreenshot
      ? `data:image/jpeg;base64,${state.lastScreenshot}`
      : null,
  };
}

export async function connectTap(id: string, x: number, y: number) {
  const state = sessions.get(id);
  if (!state?.page) throw new Error("No live browser for this session");
  const viewport = state.page.viewportSize() ?? { width: 390, height: 844 };
  await state.page.mouse.click(x * viewport.width, y * viewport.height);
  await state.page.waitForTimeout(350);
  await refreshScreenshot(state);
  return connectSnapshot(id);
}

export async function connectType(id: string, text: string, submit = false) {
  const state = sessions.get(id);
  if (!state?.page) throw new Error("No live browser for this session");
  await state.page.keyboard.type(text, { delay: 25 });
  if (submit) await state.page.keyboard.press("Enter");
  await state.page.waitForTimeout(350);
  await refreshScreenshot(state);
  return connectSnapshot(id);
}

export async function completeConnect(
  id: string,
  passphrase: string,
): Promise<SainsburysSession> {
  const state = sessions.get(id);
  if (!state) throw new Error("Connect session not found");
  state.status = "capturing";

  if (!state.page || !state.browser) {
    throw new Error(
      "No live browser session to capture. Start Connect again after installing Playwright Chromium.",
    );
  }

  const cookies = await state.page.context().cookies();
  const wc = cookies.find((c) =>
    c.name.toLowerCase().includes("wc_authentication") ||
    c.name.toLowerCase() === "wcauthtoken",
  );

  const session: SainsburysSession = {
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
    })),
    wcAuthToken: wc?.value,
    capturedAt: new Date().toISOString(),
    label: "Sainsbury's (Pixel connect)",
  };

  if (!cookies.length) {
    state.status = "awaiting_login";
    throw new Error("No cookies captured yet — finish signing in, then save again");
  }

  saveSessionWithPassphrase(session, passphrase);
  state.status = "completed";
  await closeConnect(id);
  return { ...session, cookies: session.cookies.map((c) => ({ ...c, value: "***" })) };
}

export async function closeConnect(id: string) {
  const state = sessions.get(id);
  if (!state) return;
  try {
    await state.browser?.close();
  } catch {
    // ignore
  }
  state.browser = undefined;
  state.page = undefined;
  state.status = state.status === "completed" ? "completed" : "closed";
  // keep metadata briefly for UI, then drop
  setTimeout(() => sessions.delete(id), 60_000);
}

/** Demo-only encrypted vault for CI / offline — not a real retailer session. */
export function saveDemoSession(passphrase: string) {
  const session: SainsburysSession = {
    cookies: [{ name: "demo", value: "not-a-real-session", domain: ".sainsburys.co.uk" }],
    capturedAt: new Date().toISOString(),
    label: "Demo vault (not live)",
  };
  saveSessionWithPassphrase(session, passphrase);
  return vaultPublicView(session);
}

function vaultPublicView(session: SainsburysSession) {
  return {
    capturedAt: session.capturedAt,
    label: session.label,
    cookieCount: session.cookies.length,
    hasAuthToken: Boolean(session.wcAuthToken),
  };
}
