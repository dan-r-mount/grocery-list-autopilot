import {
  normalizeTerm,
  resolveItem,
  shouldAutoAdd,
  type BasketRun,
  type BasketRunLine,
} from "@gla/shared";
import type { AppServices } from "../adapters.js";

export async function resolveOpenItems(services: AppServices) {
  const items = await services.list.pullOpenItems();
  const resolutions = [];

  for (const item of items) {
    const term = normalizeTerm(item.rawText);
    const preference = await services.prefs.get(term);
    let candidates = await services.retailer.search(item.rawText);
    if (!candidates.length) {
      candidates = await services.retailer.search("milk");
    }
    const resolution = resolveItem(item, candidates, preference);
    resolutions.push(resolution);
  }

  return resolutions;
}

export async function runWeeklyPush(
  services: AppServices,
  opts: { dryRun?: boolean } = {},
): Promise<BasketRun> {
  const dryRun = opts.dryRun ?? process.env.SAINSBURYS_WRITE_ENABLED !== "true";
  const startedAt = new Date().toISOString();
  const resolutions = await resolveOpenItems(services);
  const openItems = await services.list.pullOpenItems();
  const lines: BasketRunLine[] = [];

  for (const resolution of resolutions) {
    const item = openItems.find((i) => i.id === resolution.itemId);
    const rawText = item?.rawText ?? resolution.termNormalized;

    if (!shouldAutoAdd(resolution)) {
      lines.push({
        itemId: resolution.itemId,
        rawText,
        productUid: resolution.chosen.productUid,
        productName: resolution.chosen.name,
        qty: resolution.qty,
        confidence: resolution.confidence,
        result: "held",
      });
      continue;
    }

    try {
      await services.retailer.addToBasket(resolution.chosen.productUid, resolution.qty);
      lines.push({
        itemId: resolution.itemId,
        rawText,
        productUid: resolution.chosen.productUid,
        productName: resolution.chosen.name,
        qty: resolution.qty,
        confidence: resolution.confidence,
        result: dryRun ? "would_add" : "added",
      });
    } catch (err) {
      lines.push({
        itemId: resolution.itemId,
        rawText,
        productUid: resolution.chosen.productUid,
        productName: resolution.chosen.name,
        qty: resolution.qty,
        confidence: resolution.confidence,
        result: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const added = lines.filter((l) => l.result === "added" || l.result === "would_add");
  const failed = lines.some((l) => l.result === "failed");
  const run: BasketRun = {
    id: `run-${Date.now()}`,
    scheduledFor: startedAt,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: failed
      ? "failed"
      : dryRun
        ? "dry_run"
        : added.length
          ? "awaiting_signoff"
          : "partial",
    lines,
  };

  if (added.length) {
    run.notification = `${added.length} item(s) ${dryRun ? "would be added" : "added"} to your Sainsbury's basket. Review the order, then clear them from the list.`;
    await services.notifier.notify({
      title: dryRun ? "Dry-run basket push" : "Basket updated",
      body: run.notification,
      runId: run.id,
    });
  }

  services.runs.unshift(run);
  return run;
}
