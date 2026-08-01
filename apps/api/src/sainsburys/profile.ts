import { existsSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import type { BrowserContext, Page } from "playwright";
import { dataPath, randomToken } from "../security/crypto.js";
import { loadSettings, parseProxyUrl } from "../security/settings.js";

/**
 * Persistent-profile authentication.
 *
 * Instead of extracting a cookie jar and re-injecting it later, Autopilot keeps
 * one long-lived Chromium profile. You log in once inside that profile and the
 * browser keeps the session the same way your everyday browser does: cookies
 * rotate in place, Akamai sensors stay attached to a stable client, and no
 * credential or session blob is ever exported.
 */

const PROFILE_DIR = () => dataPath("browser-profile");
const HOME_URL = "https://www.sainsburys.co.uk/";
const LOGIN_URL = "https://www.sainsburys.co.uk/gol-ui/Hello";

const AUTH_COOKIE_HINTS = ["wc_authentication", "wcauthtoken", "wcrememberme"];

let context: BrowserContext | null = null;

type LoginSession = {
  id: string;
  page: Page;
  lastScreenshot?: string;
  pageUrl?: string;
  status: "awaiting_login" | "logged_in" | "blocked" | "closed";
  error?: string;
};

let loginSession: LoginSession | null = null;

function ensureProfileDir(): string {
  const dir = PROFILE_DIR();
  mkdirSync(dir, { recursive: true });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // best effort
  }
  return dir;
}

export function profileExists(): boolean {
  return existsSync(PROFILE_DIR());
}

export async function getProfileContext(): Promise<BrowserContext> {
  if (context) return context;

  const playwright = await import("playwright");
  const proxy = parseProxyUrl(loadSettings().sainsburysProxyUrl);

  context = await playwright.chromium.launchPersistentContext(ensureProfileDir(), {
    headless: true,
    proxy: proxy
      ? { server: proxy.server, username: proxy.username, password: proxy.password }
      : undefined,
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
    locale: "en-GB",
    timezoneId: "Europe/London",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  await context.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en"] });
  `);

  return context;
}

export async function closeProfileContext() {
  try {
    await context?.close();
  } catch {
    // ignore
  }
  context = null;
  loginSession = null;
}

/** True when the persistent profile currently holds a logged-in Sainsbury's session. */
export async function isProfileLoggedIn(): Promise<boolean> {
  if (!profileExists()) return false;
  const ctx = await getProfileContext();
  const cookies = await ctx.cookies("https://www.sainsburys.co.uk");
  return cookies.some((c) =>
    AUTH_COOKIE_HINTS.some((hint) => c.name.toLowerCase().includes(hint)),
  );
}

export async function profileStatus() {
  const exists = profileExists();
  let loggedIn = false;
  let error: string | null = null;
  if (exists) {
    try {
      loggedIn = await isProfileLoggedIn();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    mode: "persistent_profile" as const,
    exists,
    loggedIn,
    proxyConfigured: Boolean(parseProxyUrl(loadSettings().sainsburysProxyUrl)),
    error,
  };
}

/** Wipe the profile — the only "logout" that removes retailer session material. */
export async function forgetProfile() {
  await closeProfileContext();
  const dir = PROFILE_DIR();
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

async function captureScreenshot(session: LoginSession) {
  const buf = await session.page.screenshot({ type: "jpeg", quality: 55 });
  session.lastScreenshot = buf.toString("base64");
  session.pageUrl = session.page.url();

  try {
    const text = (await session.page.locator("body").innerText({ timeout: 2000 })).toLowerCase();
    if (text.includes("access denied") || text.includes("errors.edgesuite.net")) {
      session.status = "blocked";
      session.error =
        "Sainsbury’s blocked this network (Akamai geo/bot gate). Run Autopilot on a UK home network, or set a UK residential proxy.";
      return;
    }
  } catch {
    // page still loading
  }

  if (await isProfileLoggedIn()) {
    session.status = "logged_in";
  }
}

/** Start an interactive login inside the persistent profile. Nothing is exported afterwards. */
export async function startProfileLogin() {
  const ctx = await getProfileContext();
  const page = await ctx.newPage();
  const session: LoginSession = {
    id: randomToken(8),
    page,
    status: "awaiting_login",
  };
  loginSession = session;

  await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1200);
  await captureScreenshot(session);

  return profileLoginSnapshot();
}

export async function profileLoginSnapshot() {
  if (!loginSession) throw new Error("No login session — start profile login first");
  if (loginSession.status === "awaiting_login") {
    try {
      await captureScreenshot(loginSession);
    } catch (err) {
      loginSession.error = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    id: loginSession.id,
    status: loginSession.status,
    error: loginSession.error ?? null,
    pageUrl: loginSession.pageUrl ?? null,
    screenshotDataUrl: loginSession.lastScreenshot
      ? `data:image/jpeg;base64,${loginSession.lastScreenshot}`
      : null,
  };
}

export async function profileLoginTap(x: number, y: number) {
  if (!loginSession) throw new Error("No login session");
  const viewport = loginSession.page.viewportSize() ?? { width: 390, height: 844 };
  await loginSession.page.mouse.click(x * viewport.width, y * viewport.height);
  await loginSession.page.waitForTimeout(350);
  await captureScreenshot(loginSession);
  return profileLoginSnapshot();
}

export async function profileLoginType(text: string, submit = false) {
  if (!loginSession) throw new Error("No login session");
  await loginSession.page.keyboard.type(text, { delay: 25 });
  if (submit) await loginSession.page.keyboard.press("Enter");
  await loginSession.page.waitForTimeout(350);
  await captureScreenshot(loginSession);
  return profileLoginSnapshot();
}

export async function finishProfileLogin() {
  if (!loginSession) throw new Error("No login session");
  const loggedIn = await isProfileLoggedIn();
  try {
    await loginSession.page.close();
  } catch {
    // ignore
  }
  loginSession.status = "closed";
  loginSession = null;
  return { loggedIn };
}
