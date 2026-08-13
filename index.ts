import { assertConfigSane, config } from "./config.js";
import { account } from "./clients.js";
import { logger } from "./logger.js";
import { runCycle } from "./cycle.js";

assertConfigSane();

logger.info("Buyback & burn bot starting", {
  wallet: account.address,
  chainId: config.chainId,
  intervalMinutes: config.intervalMinutes,
  dryRun: config.dryRun,
  burnMethod: config.burnMethod,
});

const runOnce = process.argv.includes("--once");

if (runOnce) {
  runCycle().then(() => process.exit(0));
} else {
  // Run immediately, then every N minutes.
  void runCycle();
  const intervalMs = config.intervalMinutes * 60 * 1000;
  const timer = setInterval(() => void runCycle(), intervalMs);

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    clearInterval(timer);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
