import "./styles.css";
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

type ListItem = {
  id: string;
  rawText: string;
  status: string;
  source: string;
};

type Resolution = {
  itemId: string;
  termNormalized: string;
  chosen: { name: string; sizeLabel?: string; productUid: string };
  qty: number;
  confidence: number;
  reason: string;
};

type BasketRun = {
  id: string;
  status: string;
  notification?: string;
  lines: Array<{
    rawText: string;
    productName: string;
    qty: number;
    result: string;
    confidence: number;
  }>;
};

type AppSettings = {
  ntfyTopic: string;
  ntfyServer: string;
};

type AuthStatus = {
  bootstrapped: boolean;
  memberCount: number;
  members: Array<{ id: string; displayName: string; passkeyCount: number }>;
  user: { userId: string; displayName: string } | null;
  sainsburys: {
    hasVault: boolean;
    unlocked: boolean;
    capturedAt: string | null;
    label: string | null;
  };
  settings: AppSettings | null;
};

type ConnectSnapshot = {
  id: string;
  status: string;
  error?: string;
  pageUrl?: string;
  screenshotDataUrl: string | null;
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app missing");
const app: HTMLDivElement = root;

const isSecure = window.isSecureContext;
const isLocalhost =
  location.hostname === "localhost" || location.hostname === "127.0.0.1";

const state: {
  auth: AuthStatus | null;
  items: ListItem[];
  resolutions: Resolution[];
  runs: BasketRun[];
  message: string;
  busy: boolean;
  displayName: string;
  inviteCode: string;
  vaultPassphrase: string;
  ntfyTopic: string;
  ntfyServer: string;
  connectId: string | null;
  connect: ConnectSnapshot | null;
  typeBuffer: string;
  pollTimer: number | null;
} = {
  auth: null,
  items: [],
  resolutions: [],
  runs: [],
  message: "",
  busy: false,
  displayName: "",
  inviteCode: "",
  vaultPassphrase: "",
  ntfyTopic: "",
  ntfyServer: "https://ntfy.sh",
  connectId: null,
  connect: null,
  typeBuffer: "",
  pollTimer: null,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${path} failed (${res.status})`);
  return data;
}

async function refreshAuth() {
  state.auth = await api<AuthStatus>("/api/auth/status");
  if (state.auth.settings) {
    state.ntfyTopic = state.auth.settings.ntfyTopic;
    state.ntfyServer = state.auth.settings.ntfyServer;
  }
}

async function refreshApp() {
  if (!state.auth?.user) {
    state.items = [];
    state.resolutions = [];
    state.runs = [];
    return;
  }
  const [list, resolutions, runs] = await Promise.all([
    api<{ items: ListItem[] }>("/api/list"),
    api<{ resolutions: Resolution[] }>("/api/resolutions"),
    api<{ runs: BasketRun[] }>("/api/runs"),
  ]);
  state.items = list.items;
  state.resolutions = resolutions.resolutions;
  state.runs = runs.runs;
  await refreshAuth();
}

async function refreshAll() {
  await refreshAuth();
  await refreshApp();
  render();
}

async function registerPasskey() {
  if (!browserSupportsWebAuthn()) {
    throw new Error("This browser does not support passkeys");
  }
  state.busy = true;
  render();
  try {
    const opts = await api<{
      challengeId: string;
      options: Parameters<typeof startRegistration>[0]["optionsJSON"];
    }>("/api/auth/register/options", {
      method: "POST",
      body: JSON.stringify({
        displayName: state.displayName || "Household member",
        inviteCode: state.inviteCode || undefined,
      }),
    });
    const response = await startRegistration({ optionsJSON: opts.options });
    await api("/api/auth/register/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: opts.challengeId, response }),
    });
    state.message = "Passkey registered — you’re signed in.";
    state.inviteCode = "";
    await refreshAll();
  } finally {
    state.busy = false;
    render();
  }
}

async function loginPasskey() {
  if (!browserSupportsWebAuthn()) {
    throw new Error("This browser does not support passkeys");
  }
  state.busy = true;
  render();
  try {
    const opts = await api<{
      challengeId: string;
      options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
    }>("/api/auth/login/options", { method: "POST", body: "{}" });
    const response = await startAuthentication({ optionsJSON: opts.options });
    await api("/api/auth/login/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: opts.challengeId, response }),
    });
    state.message = "Signed in with passkey.";
    await refreshAll();
  } finally {
    state.busy = false;
    render();
  }
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  stopConnectPoll();
  state.message = "Signed out.";
  await refreshAll();
}

async function createInvite() {
  const { invite } = await api<{ invite: { code: string; expiresAt: string } }>(
    "/api/auth/invite",
    { method: "POST", body: "{}" },
  );
  state.message = `Partner invite code: ${invite.code} (expires ${new Date(invite.expiresAt).toLocaleString()})`;
  render();
}

async function unlockVault() {
  await api("/api/sainsburys/unlock", {
    method: "POST",
    body: JSON.stringify({ passphrase: state.vaultPassphrase }),
  });
  state.message = "Sainsbury's vault unlocked in memory.";
  await refreshAll();
}

async function lockVault() {
  await api("/api/sainsburys/lock", { method: "POST", body: "{}" });
  state.message = "Vault locked.";
  await refreshAll();
}

async function disconnectVault() {
  if (!confirm("Remove the encrypted Sainsbury's session from this server?")) return;
  await api("/api/sainsburys/disconnect", { method: "POST", body: "{}" });
  state.message = "Disconnected Sainsbury's vault.";
  await refreshAll();
}

function stopConnectPoll() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function startConnect() {
  state.busy = true;
  render();
  try {
    const result = await api<{ id: string; mode: string; message: string }>(
      "/api/sainsburys/connect/start",
      { method: "POST", body: "{}" },
    );
    state.connectId = result.id;
    state.message = result.message;
    state.connect = await api<ConnectSnapshot>(`/api/sainsburys/connect/${result.id}`);
    stopConnectPoll();
    state.pollTimer = window.setInterval(() => {
      void pollConnect();
    }, 1200);
  } finally {
    state.busy = false;
    render();
  }
}

async function pollConnect() {
  if (!state.connectId) return;
  try {
    state.connect = await api<ConnectSnapshot>(
      `/api/sainsburys/connect/${state.connectId}`,
    );
    render();
  } catch {
    // ignore transient poll errors
  }
}

async function onConnectTap(event: MouseEvent) {
  if (!state.connectId) return;
  const img = event.currentTarget as HTMLImageElement;
  const rect = img.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  state.connect = await api<ConnectSnapshot>(
    `/api/sainsburys/connect/${state.connectId}/tap`,
    { method: "POST", body: JSON.stringify({ x, y }) },
  );
  render();
}

async function sendConnectText() {
  if (!state.connectId || !state.typeBuffer) return;
  state.connect = await api<ConnectSnapshot>(
    `/api/sainsburys/connect/${state.connectId}/type`,
    {
      method: "POST",
      body: JSON.stringify({ text: state.typeBuffer, submit: false }),
    },
  );
  state.typeBuffer = "";
  render();
}

async function saveConnectSession() {
  if (!state.connectId) return;
  if (state.vaultPassphrase.length < 8) {
    state.message = "Set a vault passphrase (8+ chars) before saving the session.";
    render();
    return;
  }
  state.busy = true;
  render();
  try {
    await api(`/api/sainsburys/connect/${state.connectId}/save`, {
      method: "POST",
      body: JSON.stringify({ passphrase: state.vaultPassphrase }),
    });
    stopConnectPoll();
    state.connectId = null;
    state.connect = null;
    state.message =
      "Sainsbury's session saved encrypted. Password was never stored — only cookies in the vault.";
    await refreshAll();
  } finally {
    state.busy = false;
    render();
  }
}

async function saveDemoVault() {
  if (state.vaultPassphrase.length < 8) {
    state.message = "Choose a vault passphrase (8+ characters) first.";
    render();
    return;
  }
  await api("/api/sainsburys/demo-vault", {
    method: "POST",
    body: JSON.stringify({ passphrase: state.vaultPassphrase }),
  });
  state.message = "Demo vault saved (not a real Sainsbury's login).";
  await refreshAll();
}

async function saveNotifySettings() {
  const { settings } = await api<{ settings: AppSettings }>("/api/settings", {
    method: "PUT",
    body: JSON.stringify({
      ntfyTopic: state.ntfyTopic,
      ntfyServer: state.ntfyServer,
    }),
  });
  state.ntfyTopic = settings.ntfyTopic;
  state.ntfyServer = settings.ntfyServer;
  state.message = settings.ntfyTopic
    ? `Notifications will go to ntfy topic “${settings.ntfyTopic}”.`
    : "Notification topic cleared.";
  await refreshAll();
}

async function testNotify() {
  const result = await api<{ ok: boolean; detail: string }>("/api/notify/test", {
    method: "POST",
    body: "{}",
  });
  state.message = result.detail;
  render();
}

async function dryRunPush() {
  state.busy = true;
  render();
  try {
    const { run } = await api<{ run: BasketRun }>("/api/runs/weekly", {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    state.message = run.notification ?? `Run ${run.id} completed (${run.status}).`;
    await refreshAll();
  } finally {
    state.busy = false;
    render();
  }
}

async function signOff(runId: string) {
  state.busy = true;
  render();
  try {
    const result = await api<{ message: string }>(`/api/runs/${runId}/signoff`, {
      method: "POST",
      body: "{}",
    });
    state.message = result.message;
    await refreshAll();
  } finally {
    state.busy = false;
    render();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function phoneHintBanner(): string {
  if (isSecure || isLocalhost) {
    return `<div class="banner">You’re on a secure page — passkeys can work here. This phone only needs Chrome; <strong>pnpm runs on your computer</strong>, not on the Pixel.</div>`;
  }
  return `<div class="banner warn">This page is not HTTPS, so Android passkeys will fail. On your computer run <code>pnpm mobile</code>, then open the printed <code>https://…trycloudflare.com</code> link here in Chrome.</div>`;
}

function renderAuthGate() {
  const bootstrapped = state.auth?.bootstrapped ?? false;
  return `
    <header>
      <p class="brand">Autopilot</p>
      <p class="lede">Sign in with a passkey. Your computer runs the app; this Pixel is just the browser.</p>
      ${phoneHintBanner()}
      ${!browserSupportsWebAuthn() ? `<div class="banner warn">Passkeys aren’t available in this browser context. Use the HTTPS tunnel URL from <code>pnpm mobile</code>.</div>` : ""}
      ${state.message ? `<div class="banner">${escapeHtml(state.message)}</div>` : ""}
    </header>
    <section class="panel">
      <h2>${bootstrapped ? "Sign in" : "Create household"}</h2>
      <label class="field">Display name
        <input data-field="displayName" value="${escapeHtml(state.displayName)}" placeholder="Dan" autocomplete="name" />
      </label>
      ${
        bootstrapped
          ? `<label class="field">Partner invite (optional, for a new passkey)
              <input data-field="inviteCode" value="${escapeHtml(state.inviteCode)}" placeholder="invite code" autocomplete="off" />
            </label>`
          : `<p class="meta">First passkey becomes the household owner. Your partner can join later with an invite code.</p>`
      }
      <div class="toolbar">
        ${
          bootstrapped
            ? `<button type="button" data-action="login" ${state.busy ? "disabled" : ""}>Sign in with passkey</button>
               <button type="button" class="secondary" data-action="register" ${state.busy ? "disabled" : ""}>Register another passkey</button>`
            : `<button type="button" data-action="register" ${state.busy ? "disabled" : ""}>Register passkey</button>`
        }
      </div>
    </section>
  `;
}

function renderApp() {
  const resolutionByItem = new Map(state.resolutions.map((r) => [r.itemId, r]));
  const sb = state.auth?.sainsburys;
  return `
    <header>
      <p class="brand">Autopilot</p>
      <p class="lede">Signed in as <strong>${escapeHtml(state.auth?.user?.displayName ?? "")}</strong>. Connect Sainsbury’s from this phone — login happens in a live browser view; only an encrypted session is kept.</p>
      ${phoneHintBanner()}
      ${state.message ? `<div class="banner">${escapeHtml(state.message)}</div>` : ""}
      <div class="toolbar">
        <button type="button" class="secondary" data-action="invite" ${state.busy ? "disabled" : ""}>Partner invite</button>
        <button type="button" class="secondary" data-action="refresh" ${state.busy ? "disabled" : ""}>Refresh</button>
        <button type="button" class="secondary" data-action="logout" ${state.busy ? "disabled" : ""}>Sign out</button>
      </div>
    </header>

    <section class="panel">
      <h2>Phone notifications (ntfy)</h2>
      <p class="meta">Install the free <strong>ntfy</strong> app on your Pixel, subscribe to a topic name you invent, then save it here. No Google Firebase setup required.</p>
      <label class="field">Topic
        <input data-field="ntfyTopic" value="${escapeHtml(state.ntfyTopic)}" placeholder="e.g. dan-grocery-autopilot-7f3a" autocomplete="off" />
      </label>
      <label class="field">Server
        <input data-field="ntfyServer" value="${escapeHtml(state.ntfyServer)}" placeholder="https://ntfy.sh" autocomplete="off" />
      </label>
      <div class="toolbar">
        <button type="button" data-action="save-notify" ${state.busy ? "disabled" : ""}>Save notification settings</button>
        <button type="button" class="secondary" data-action="test-notify" ${state.busy ? "disabled" : ""}>Send test notification</button>
      </div>
    </section>

    <section class="panel">
      <h2>Sainsbury’s secure connect</h2>
      <p class="meta">Vault: ${sb?.hasVault ? "present" : "empty"} · ${sb?.unlocked ? "unlocked" : "locked"}${sb?.label ? ` · ${escapeHtml(sb.label)}` : ""}</p>
      <div class="banner">Today on phone-only: type any passphrase (8+ characters), then tap <strong>Save demo vault</strong>. That proves encryption works. Real Sainsbury’s login is blocked from this temporary cloud browser — that’s the “Access Denied” page, not a passphrase problem.</div>
      <label class="field">Vault passphrase (never stored — used to encrypt the session)
        <input data-field="vaultPassphrase" type="password" value="${escapeHtml(state.vaultPassphrase)}" placeholder="min 8 characters" autocomplete="new-password" />
      </label>
      <div class="toolbar">
        <button type="button" data-action="demo-vault" ${state.busy ? "disabled" : ""}>Save demo vault</button>
        <button type="button" class="secondary" data-action="unlock" ${state.busy ? "disabled" : ""}>Unlock vault</button>
        <button type="button" class="secondary" data-action="lock" ${state.busy ? "disabled" : ""}>Lock</button>
        <button type="button" class="secondary" data-action="disconnect" ${state.busy ? "disabled" : ""}>Disconnect</button>
        <button type="button" class="secondary" data-action="connect" ${state.busy ? "disabled" : ""}>Try live Sainsbury’s connect</button>
      </div>
      ${
        state.connect
          ? `<div class="connect">
              <p class="meta">Status: ${escapeHtml(state.connect.status)}${state.connect.pageUrl ? ` · ${escapeHtml(state.connect.pageUrl)}` : ""}</p>
              ${state.connect.error ? `<p class="meta warn-text">${escapeHtml(state.connect.error)}</p>` : ""}
              ${
                state.connect.screenshotDataUrl
                  ? `<img class="live-view" alt="Sainsbury's login live view" src="${state.connect.screenshotDataUrl}" data-action="connect-tap" />`
                  : `<p class="empty">Live view unavailable. On the computer run <code>pnpm playwright:install</code>, or use demo vault for UI testing.</p>`
              }
              <label class="field">Type into the live page
                <input data-field="typeBuffer" value="${escapeHtml(state.typeBuffer)}" placeholder="email / password / MFA code" />
              </label>
              <div class="toolbar">
                <button type="button" class="secondary" data-action="connect-type" ${state.busy ? "disabled" : ""}>Send text</button>
                <button type="button" data-action="connect-save" ${state.busy ? "disabled" : ""}>Save encrypted session</button>
              </div>
            </div>`
          : ""
      }
    </section>

    <div class="grid">
      <section>
        <h2>Shopping list</h2>
        <ul>
          ${
            state.items.length
              ? state.items
                  .map((item) => {
                    const r = resolutionByItem.get(item.id);
                    return `<li>
                      <strong>${escapeHtml(item.rawText)}</strong>
                      <div class="meta">${escapeHtml(item.source)} · ${escapeHtml(item.status)}</div>
                      ${
                        r
                          ? `<div class="meta">→ ${escapeHtml(r.chosen.name)}${r.chosen.sizeLabel ? ` (${escapeHtml(r.chosen.sizeLabel)})` : ""} × ${r.qty} · ${(r.confidence * 100).toFixed(0)}%</div>`
                          : ""
                      }
                    </li>`;
                  })
                  .join("")
              : `<li class="empty">No open items.</li>`
          }
        </ul>
        <div class="toolbar">
          <button type="button" class="secondary" data-action="dry-run" ${state.busy ? "disabled" : ""}>Dry-run weekly push</button>
        </div>
      </section>
      <section>
        <h2>Recent runs</h2>
        <ul>
          ${
            state.runs.length
              ? state.runs
                  .map(
                    (run) => `<li>
                      <strong>${escapeHtml(run.id)}</strong>
                      <span class="status">${escapeHtml(run.status)}</span>
                      <div class="meta">${run.lines
                        .map(
                          (l) =>
                            `${escapeHtml(l.rawText)} → ${escapeHtml(l.productName)} × ${l.qty} (${escapeHtml(l.result)})`,
                        )
                        .join("; ")}</div>
                      <div class="toolbar" style="margin:0.75rem 0 0">
                        <button type="button" class="secondary" data-signoff="${escapeHtml(run.id)}" ${state.busy ? "disabled" : ""}>Mark human sign-off</button>
                      </div>
                    </li>`,
                  )
                  .join("")
              : `<li class="empty">No runs yet.</li>`
          }
        </ul>
      </section>
    </div>
    <footer>Full Pixel guide: <code>docs/PIXEL.md</code>. Never put Sainsbury’s passwords in .env.</footer>
  `;
}

function bindFields() {
  app.querySelectorAll<HTMLInputElement>("[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.field as
        | "displayName"
        | "inviteCode"
        | "vaultPassphrase"
        | "typeBuffer"
        | "ntfyTopic"
        | "ntfyServer";
      state[key] = input.value;
    });
  });
}

function bindActions() {
  const wrap = (fn: () => Promise<void>) => () => {
    void fn().catch((err) => {
      state.message = err instanceof Error ? err.message : String(err);
      state.busy = false;
      render();
    });
  };

  app.querySelector('[data-action="register"]')?.addEventListener("click", wrap(registerPasskey));
  app.querySelector('[data-action="login"]')?.addEventListener("click", wrap(loginPasskey));
  app.querySelector('[data-action="logout"]')?.addEventListener("click", wrap(logout));
  app.querySelector('[data-action="invite"]')?.addEventListener("click", wrap(createInvite));
  app.querySelector('[data-action="refresh"]')?.addEventListener("click", wrap(refreshAll));
  app.querySelector('[data-action="connect"]')?.addEventListener("click", wrap(startConnect));
  app.querySelector('[data-action="unlock"]')?.addEventListener("click", wrap(unlockVault));
  app.querySelector('[data-action="lock"]')?.addEventListener("click", wrap(lockVault));
  app.querySelector('[data-action="disconnect"]')?.addEventListener("click", wrap(disconnectVault));
  app.querySelector('[data-action="demo-vault"]')?.addEventListener("click", wrap(saveDemoVault));
  app.querySelector('[data-action="save-notify"]')?.addEventListener("click", wrap(saveNotifySettings));
  app.querySelector('[data-action="test-notify"]')?.addEventListener("click", wrap(testNotify));
  app.querySelector('[data-action="connect-type"]')?.addEventListener("click", wrap(sendConnectText));
  app.querySelector('[data-action="connect-save"]')?.addEventListener("click", wrap(saveConnectSession));
  app.querySelector('[data-action="dry-run"]')?.addEventListener("click", wrap(dryRunPush));
  app.querySelector('[data-action="connect-tap"]')?.addEventListener("click", (event) => {
    void onConnectTap(event as MouseEvent).catch((err) => {
      state.message = err instanceof Error ? err.message : String(err);
      render();
    });
  });
  app.querySelectorAll<HTMLButtonElement>("[data-signoff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.signoff;
      if (id) wrap(() => signOff(id))();
    });
  });
}

function render() {
  app.innerHTML = state.auth?.user ? renderApp() : renderAuthGate();
  bindFields();
  bindActions();
}

render();
void refreshAll().catch((err) => {
  state.message =
    err instanceof Error
      ? `API unreachable (${err.message}). On your computer run: pnpm mobile`
      : String(err);
  render();
});
