import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDefaultServices } from "./adapters.js";
import { resolveOpenItems, runWeeklyPush } from "./jobs/weekly-push.js";

const services = await createDefaultServices();
const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  }),
);

app.get("/health", (c) => c.json({ ok: true, service: "grocery-list-autopilot-api" }));

app.get("/api/list", async (c) => {
  const items = await services.list.pullOpenItems();
  return c.json({ items });
});

app.get("/api/resolutions", async (c) => {
  const resolutions = await resolveOpenItems(services);
  return c.json({ resolutions });
});

app.get("/api/runs", (c) => c.json({ runs: services.runs }));

app.post("/api/runs/weekly", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const dryRun = body.dryRun !== false;
  const run = await runWeeklyPush(services, { dryRun });
  return c.json({ run });
});

app.post("/api/runs/:id/signoff", async (c) => {
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
});

const port = Number(process.env.PORT ?? 3001);
console.log(`API listening on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
