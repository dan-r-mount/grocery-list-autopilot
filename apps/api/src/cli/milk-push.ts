import { createDefaultServices } from "../adapters.js";
import { runWeeklyPush } from "../jobs/weekly-push.js";

const dryRun = !process.argv.includes("--live");
const services = await createDefaultServices();
const run = await runWeeklyPush(services, { dryRun });

console.log(JSON.stringify(run, null, 2));
console.log(
  dryRun
    ? "\nDry-run complete. Pass --live and set SAINSBURYS_WRITE_ENABLED=true for real basket writes (Phase 1)."
    : "\nLive push attempted. Human must sign off the Sainsbury's order.",
);
