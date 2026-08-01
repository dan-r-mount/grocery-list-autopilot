import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dataPath } from "./crypto.js";

export type AppSettings = {
  ntfyTopic: string;
  ntfyServer: string;
  /** Playwright / retailer HTTP proxy, e.g. http://user:pass@host:port */
  sainsburysProxyUrl: string;
};

const DEFAULTS: AppSettings = {
  ntfyTopic: "",
  ntfyServer: "https://ntfy.sh",
  sainsburysProxyUrl: "",
};

function settingsFile() {
  return dataPath("settings.json");
}

export function loadSettings(): AppSettings {
  const file = settingsFile();
  if (!existsSync(file)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(file, "utf8")) as AppSettings) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  next.ntfyTopic = (next.ntfyTopic ?? "").trim();
  next.ntfyServer = (next.ntfyServer || DEFAULTS.ntfyServer).replace(/\/$/, "");
  next.sainsburysProxyUrl = (next.sainsburysProxyUrl ?? "").trim();
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}

export function parseProxyUrl(proxyUrl: string): {
  server: string;
  username?: string;
  password?: string;
} | null {
  if (!proxyUrl) return null;
  try {
    const u = new URL(proxyUrl);
    if (!u.hostname) return null;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return {
      server: `${u.protocol}//${u.hostname}:${port}`,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return null;
  }
}
