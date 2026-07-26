import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dataPath } from "./crypto.js";

export type AppSettings = {
  ntfyTopic: string;
  ntfyServer: string;
};

const DEFAULTS: AppSettings = {
  ntfyTopic: "",
  ntfyServer: "https://ntfy.sh",
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
  next.ntfyTopic = next.ntfyTopic.trim();
  next.ntfyServer = (next.ntfyServer || DEFAULTS.ntfyServer).replace(/\/$/, "");
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
  return next;
}
