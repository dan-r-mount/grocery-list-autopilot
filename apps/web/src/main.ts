import "./styles.css";

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

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("#app missing");
const app: HTMLDivElement = root;

const state: {
  items: ListItem[];
  resolutions: Resolution[];
  runs: BasketRun[];
  message: string;
  busy: boolean;
} = {
  items: [],
  resolutions: [],
  runs: [],
  message: "",
  busy: false,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function refresh() {
  const [list, resolutions, runs] = await Promise.all([
    api<{ items: ListItem[] }>("/api/list"),
    api<{ resolutions: Resolution[] }>("/api/resolutions"),
    api<{ runs: BasketRun[] }>("/api/runs"),
  ]);
  state.items = list.items;
  state.resolutions = resolutions.resolutions;
  state.runs = runs.runs;
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
    await refresh();
  } catch (err) {
    state.message = err instanceof Error ? err.message : String(err);
    render();
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
    await refresh();
  } catch (err) {
    state.message = err instanceof Error ? err.message : String(err);
  } finally {
    state.busy = false;
    render();
  }
}

function render() {
  const resolutionByItem = new Map(state.resolutions.map((r) => [r.itemId, r]));

  app.innerHTML = `
    <header>
      <p class="brand">Autopilot</p>
      <p class="lede">Shared grocery list for your household. Resolve vague items like milk into the Sainsbury’s products you actually buy — then push to the basket and sign off as humans.</p>
      <div class="toolbar">
        <button type="button" data-action="refresh" ${state.busy ? "disabled" : ""}>Refresh</button>
        <button type="button" class="secondary" data-action="dry-run" ${state.busy ? "disabled" : ""}>Dry-run weekly push</button>
      </div>
      ${state.message ? `<div class="banner">${escapeHtml(state.message)}</div>` : ""}
    </header>
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
                          ? `<div class="meta">→ ${escapeHtml(r.chosen.name)}${r.chosen.sizeLabel ? ` (${escapeHtml(r.chosen.sizeLabel)})` : ""} × ${r.qty} · confidence ${(r.confidence * 100).toFixed(0)}% · ${escapeHtml(r.reason)}</div>`
                          : ""
                      }
                    </li>`;
                  })
                  .join("")
              : `<li class="empty">No open items. Seeded milk appears when the API is running.</li>`
          }
        </ul>
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
              : `<li class="empty">No runs yet. Try a dry-run weekly push.</li>`
          }
        </ul>
      </section>
    </div>
    <footer>Phase 0 scaffold — dry-run only. Live Sainsbury’s writes stay behind a feature flag.</footer>
  `;

  app.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
    void refresh().catch((err) => {
      state.message = err instanceof Error ? err.message : String(err);
      render();
    });
  });
  app.querySelector('[data-action="dry-run"]')?.addEventListener("click", () => {
    void dryRunPush();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-signoff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.signoff;
      if (id) void signOff(id);
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
void refresh().catch((err) => {
  state.message =
    err instanceof Error
      ? `API unreachable (${err.message}). Start with pnpm dev:api`
      : String(err);
  render();
});
