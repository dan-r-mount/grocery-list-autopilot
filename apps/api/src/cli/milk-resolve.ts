import { createDefaultServices } from "../adapters.js";
import { resolveOpenItems } from "../jobs/weekly-push.js";

const services = await createDefaultServices();
const resolutions = await resolveOpenItems(services);

for (const r of resolutions) {
  console.log(
    JSON.stringify(
      {
        item: r.termNormalized,
        product: r.chosen.name,
        size: r.chosen.sizeLabel,
        productUid: r.chosen.productUid,
        qty: r.qty,
        confidence: r.confidence,
        reason: r.reason,
        autoAdd: r.confidence >= 0.8 && r.reason !== "needs_review",
      },
      null,
      2,
    ),
  );
}
