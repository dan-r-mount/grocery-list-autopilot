import type { SainsburysSession } from "../security/vault.js";

export type CookieRow = NonNullable<SainsburysSession["cookies"]>[number];

/**
 * Accept the messy formats people can actually produce on a phone:
 * - Cookie-Editor JSON array
 * - { cookies: [...] }
 * - name/value map
 * - raw Cookie header: "a=b; c=d"
 * - Netscape cookie file lines
 */
export function parseCookieInput(raw: string): CookieRow[] {
  const text = raw.trim();
  if (!text) throw new Error("Paste cookies first");

  if (text.startsWith("{") || text.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("That looks like JSON but it isn’t valid. Copy the export again.");
    }
    return normalizeJsonCookies(parsed);
  }

  if (text.includes("\t") && /sainsburys\.co\.uk/i.test(text)) {
    const out: CookieRow[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split("\t");
      if (parts.length < 7) continue;
      const [domain, , path, , expires, name, value] = parts;
      if (!name) continue;
      out.push({
        name,
        value: value ?? "",
        domain: domain || ".sainsburys.co.uk",
        path: path || "/",
        expires: Number(expires) || undefined,
      });
    }
    return out;
  }

  if (text.includes("=")) {
    const out: CookieRow[] = [];
    for (const part of text.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const name = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!name) continue;
      out.push({
        name,
        value,
        domain: ".sainsburys.co.uk",
        path: "/",
      });
    }
    return out;
  }

  throw new Error(
    "Could not read that cookie paste. Use the Session Saver app, Cookie-Editor JSON, or a Cookie header string (a=b; c=d).",
  );
}

function normalizeJsonCookies(parsed: unknown): CookieRow[] {
  if (Array.isArray(parsed)) {
    return parsed.map(rowFromUnknown).filter((c): c is CookieRow => c !== null);
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.cookies)) {
      return obj.cookies.map(rowFromUnknown).filter((c): c is CookieRow => c !== null);
    }
    const values = Object.values(obj);
    if (values.length && values.every((v) => v && typeof v === "object")) {
      const rows: Array<CookieRow | null> = [];
      for (const v of values) {
        if (Array.isArray(v)) rows.push(...v.map(rowFromUnknown));
        else rows.push(rowFromUnknown(v));
      }
      const filtered = rows.filter((c): c is CookieRow => c !== null);
      if (filtered.length) return filtered;
    }
    if (values.every((v) => typeof v === "string")) {
      return Object.entries(obj).map(([name, value]) => ({
        name,
        value: String(value),
        domain: ".sainsburys.co.uk",
        path: "/",
      }));
    }
  }
  throw new Error("JSON cookies were in an unknown shape");
}

function rowFromUnknown(row: unknown): CookieRow | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const name = String(r.name ?? r.Name ?? "");
  const value = String(r.value ?? r.Value ?? "");
  if (!name) return null;
  return {
    name,
    value,
    domain: String(r.domain ?? r.Domain ?? ".sainsburys.co.uk"),
    path: String(r.path ?? r.Path ?? "/"),
    expires:
      typeof r.expires === "number"
        ? r.expires
        : typeof r.expirationDate === "number"
          ? r.expirationDate
          : undefined,
    httpOnly: Boolean(r.httpOnly ?? r.HttpOnly),
    secure: Boolean(r.secure ?? r.Secure),
  };
}
