import type { Browser, Page } from "playwright";
import { randomToken } from "../security/crypto.js";
import { loadSettings, parseProxyUrl } from "../security/settings.js";
import {
  saveSessionWithPassphrase,
  type SainsburysSession,
} from "../security/vault.js";

type ConnectState = {
  id: string;
  createdAt: number;
  status: "starting" | "awaiting_login" | "capturing" | "completed" | "failed" | "closed";
  error?: string;
  lastScreenshot?: string;
  pageUrl?: string;
  browser?: Browser;
  page?: Page;
  usedProxy: boolean;
};

const sessions = new Map<string, ConnectState>();

const HOME_URL = "https://www.sainsburys.co.uk/";
const LOGIN_URL = "https://www.sainsburys.co.uk/gol-ui/Hello";

export function getConnect(id: string) {
  return sessions.get(id);
}

async function applyStealth(page: Page) {
  await page.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  `);
}

async function detectBotBlock(state: ConnectState) {
  if (!state.page) return;
  try {
    const text = (await state.page.locator("body").innerText({ timeout: 2000 })).toLowerCase();
    if (
      text.includes("access denied") ||
      text.includes("errors.edgesuite.net") ||
      text.includes("reference #")
    ) {
      state.status = "failed";
      state.error = state.usedProxy
        ? "Sainsbury’s still blocked the browser even through your proxy. Check the proxy is UK residential/mobile with a sticky session, then retry Connect."
        : "Sainsbury’s blocked this server IP (Akamai geo/bot gate). Configure a UK residential/mobile proxy in Settings, or use Phone login (cookie import) so auth happens on your Pixel’s UK mobile IP.";
    }
  } catch {
    // ignore
  }
}

async function refreshScreenshot(state: ConnectState) {
  if (!state.page) return;
  const buf = await state.page.screenshot({ type: "jpeg", quality: 55 });
  state.lastScreenshot = buf.toString("base64");
  state.pageUrl = state.page.url();
  await detectBotBlock(state);
}

function playwrightProxyFromSettings() {
  const parsed = parseProxyUrl(loadSettings().sainsburysProxyUrl);
  if (!parsed) return null;
  return {
    server: parsed.server,
    username: parsed.username,
    password: parsed.password,
  };
}

export async function startConnect(): Promise<{
  id: string;
  mode: "live" | "unavailable" | "blocked";
  message: string;
  usedProxy: boolean;
}> {
  const id = randomToken(12);
  const proxy = playwrightProxyFromSettings();
  const state: ConnectState = {
    id,
    createdAt: Date.now(),
    status: "starting",
    usedProxy: Boolean(proxy),
  };
  sessions.set(id, state);

  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
      proxy: proxy ?? undefined,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
      locale: "en-GB",
      timezoneId: "Europe/London",
      geolocation: { latitude: 51.5074, longitude: -0.1278 },
      permissions: ["geolocation"],
      colorScheme: "light",
    });
    const page = await context.newPage();
    await applyStealth(page);
    state.browser = browser;
    state.page = page;

    // Warm Akamai sensors on the homepage before login.
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.mouse.move(120, 220);
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1500);
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);

    state.status = "awaiting_login";
    state.pageUrl = page.url();
    await refreshScreenshot(state);

    if (state.error) {
      const message = state.error;
      await closeConnect(id);
      return { id, mode: "blocked", message, usedProxy: state.usedProxy };
    }

    return {
      id,
      mode: "live",
      usedProxy: state.usedProxy,
      message: state.usedProxy
        ? "Live Sainsbury’s browser started via your UK proxy. Sign in (incl. MFA), then Save encrypted session."
        : "Live Sainsbury’s browser started. Sign in (incl. MFA), then Save encrypted session.",
    };
  } catch (err) {
    state.status = "failed";
    state.error = err instanceof Error ? err.message : String(err);
    return {
      id,
      mode: "unavailable",
      usedProxy: state.usedProxy,
      message: `Connect browser failed: ${state.error}. If this host is outside the UK, set a UK residential proxy first.`,
    };
  }
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
    usedProxy: state.usedProxy,
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

export async function completeConnect(id: string, passphrase: string) {
  const state = sessions.get(id);
  if (!state) throw new Error("Connect session not found");
  state.status = "capturing";

  if (!state.page || !state.browser) {
    throw new Error("No live browser session to capture.");
  }

  const cookies = await state.page.context().cookies();
  const session = cookiesToSession(cookies, "Sainsbury's (live connect)");
  assertSessionLooksLoggedIn(session);
  saveSessionWithPassphrase(session, passphrase);
  state.status = "completed";
  await closeConnect(id);
  return redactSession(session);
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
  setTimeout(() => sessions.delete(id), 60_000);
}

/** Import cookies captured on the Pixel (real UK mobile IP) after a normal Sainsbury’s login. */
export function importCookiesToVault(
  cookies: SainsburysSession["cookies"],
  passphrase: string,
  label = "Sainsbury's (phone cookie import)",
) {
  const session = cookiesToSession(cookies, label);
  assertSessionLooksLoggedIn(session);
  saveSessionWithPassphrase(session, passphrase);
  return redactSession(session);
}

function cookiesToSession(
  cookies: SainsburysSession["cookies"],
  label: string,
): SainsburysSession {
  const wc = cookies.find(
    (c) =>
      c.name.toLowerCase().includes("wc_authentication") ||
      c.name.toLowerCase() === "wcauthtoken",
  );
  return {
    cookies,
    wcAuthToken: wc?.value,
    capturedAt: new Date().toISOString(),
    label,
  };
}

function assertSessionLooksLoggedIn(session: SainsburysSession) {
  if (!session.cookies.length) {
    throw new Error("No cookies provided");
  }
  const names = session.cookies.map((c) => c.name.toLowerCase());
  const hasAuth = names.some(
    (n) =>
      n.includes("wc_authentication") ||
      n === "wcauthtoken" ||
      n.includes("authentication") ||
      n.includes("wcrememberme") ||
      n.includes("auth"),
  );
  // Akamai + session cookies alone are not enough, but some exports rename fields.
  const hasSessionShape =
    names.some((n) => n.includes("aka") || n.includes("bm_")) &&
    names.length >= 5;
  if (!hasAuth && !hasSessionShape) {
    throw new Error(
      "These cookies don’t look like a logged-in Sainsbury’s session. Stay logged in, then export again (include httpOnly cookies) or use the Session Saver app.",
    );
  }
}

function redactSession(session: SainsburysSession) {
  return {
    ...session,
    cookies: session.cookies.map((c) => ({ ...c, value: "***" })),
    wcAuthToken: session.wcAuthToken ? "***" : undefined,
  };
}

/** Kept for encryption unit tests only — not a Connect substitute. */
export function saveDemoSession(passphrase: string) {
  const session: SainsburysSession = {
    cookies: [
      {
        name: "WC_AUTHENTICATION_demo",
        value: "not-a-real-session",
        domain: ".sainsburys.co.uk",
      },
    ],
    capturedAt: new Date().toISOString(),
    label: "Demo vault (encryption test only)",
  };
  saveSessionWithPassphrase(session, passphrase);
  return {
    capturedAt: session.capturedAt,
    label: session.label,
    cookieCount: session.cookies.length,
    hasAuthToken: false,
  };
}
