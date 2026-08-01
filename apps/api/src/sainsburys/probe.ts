import { loadSettings, parseProxyUrl } from "../security/settings.js";

export type ReachabilityResult = {
  ok: boolean;
  status: number | null;
  serverEgress: {
    ip: string | null;
    country: string | null;
    org: string | null;
  };
  sainsburys: {
    reachable: boolean;
    blockedByAkamai: boolean;
    titleSnippet: string | null;
  };
  proxyConfigured: boolean;
  guidance: string;
};

async function fetchEgressInfo(proxyUrl?: string) {
  try {
    const init: RequestInit = { signal: AbortSignal.timeout(12_000) };
    // Node fetch doesn't support proxy natively without agent — probe egress IP without proxy first;
    // when proxy is set we still report "proxy configured" and probe Sainsbury's via Playwright separately.
    void proxyUrl;
    const res = await fetch("https://ipinfo.io/json", init);
    if (!res.ok) return { ip: null, country: null, org: null };
    const data = (await res.json()) as { ip?: string; country?: string; org?: string };
    return {
      ip: data.ip ?? null,
      country: data.country ?? null,
      org: data.org ?? null,
    };
  } catch {
    return { ip: null, country: null, org: null };
  }
}

export async function probeSainsburysReachability(): Promise<ReachabilityResult> {
  const settings = loadSettings();
  const proxyConfigured = Boolean(parseProxyUrl(settings.sainsburysProxyUrl));
  const serverEgress = await fetchEgressInfo(settings.sainsburysProxyUrl);

  let status: number | null = null;
  let body = "";
  try {
    const res = await fetch("https://www.sainsburys.co.uk/", {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    status = res.status;
    body = await res.text();
  } catch (err) {
    return {
      ok: false,
      status: null,
      serverEgress,
      sainsburys: {
        reachable: false,
        blockedByAkamai: false,
        titleSnippet: err instanceof Error ? err.message : String(err),
      },
      proxyConfigured,
      guidance: proxyConfigured
        ? "Direct server egress failed; Connect will retry through your UK proxy in the live browser."
        : "Cannot reach Sainsbury’s from this server. Configure a UK residential/mobile proxy, or use on-device Pixel login.",
    };
  }

  const blockedByAkamai =
    status === 403 ||
    /access denied/i.test(body) ||
    /edgesuite\.net/i.test(body);

  const title = body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
  const ok = !blockedByAkamai && status !== null && status < 400;

  let guidance: string;
  if (ok) {
    guidance = "Sainsbury’s is reachable from this host. You can use Connect.";
  } else if (proxyConfigured) {
    guidance =
      "Direct egress is blocked (expected on non-UK cloud hosts). Your UK proxy is configured — Connect will use it for the login browser.";
  } else if (serverEgress.country && serverEgress.country !== "GB") {
    guidance = `This server egresses from ${serverEgress.country} (${serverEgress.org ?? "unknown network"}). Sainsbury’s blocks non-UK IPs. Add a UK residential/mobile proxy in Settings, or use on-device Pixel login.`;
  } else {
    guidance =
      "Sainsbury’s blocked this IP (Akamai). Use a UK residential/mobile proxy or on-device Pixel login — do not use a demo vault as a substitute.";
  }

  return {
    ok,
    status,
    serverEgress,
    sainsburys: {
      reachable: ok,
      blockedByAkamai,
      titleSnippet: title,
    },
    proxyConfigured,
    guidance,
  };
}
