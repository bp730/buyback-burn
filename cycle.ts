import { formatUnits, parseUnits } from "viem";
import { erc20Abi } from "./abis.js";
import { config } from "./config.js";
import { account, publicClient } from "./clients.js";
import { logger } from "./logger.js";
import { swapUsdgForToken } from "./swap.js";
import { burnTokens } from "./burn.js";

let running = false;

export async function runCycle() {
  if (running) {
    logger.warn("Previous cycle still running, skipping this tick");
    return;
  }
  running = true;

  try {
    const [usdgDecimals, usdgBalance, tokenBalanceBefore] = await Promise.all([
      publicClient.readContract({
        address: config.usdgAddress,
        abi: erc20Abi,
        functionName: "decimals",
      }),
      publicClient.readContract({
        address: config.usdgAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.readContract({
        address: config.tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
    ]);

    const minBalance = parseUnits(String(config.minUsdgBalance), usdgDecimals);

    logger.info("Cycle check", {
      usdgBalance: formatUnits(usdgBalance, usdgDecimals),
      minRequired: config.minUsdgBalance,
    });

    if (usdgBalance < minBalance) {
      logger.info("USDG balance below threshold, skipping this cycle");
      return;
    }

    // Swap the entire USDG balance accumulated since last cycle.
    await swapUsdgForToken(usdgBalance);

    if (config.dryRun) {
      // In dry run we never actually received tokens, so nothing to burn.
      logger.info("[DRY RUN] Cycle complete (no on-chain state changed)");
      return;
    }

    const tokenBalanceAfter = await publicClient.readContract({
      address: config.tokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });

    const received = tokenBalanceAfter - tokenBalanceBefore;
    if (received <= 0n) {
      logger.warn("No tokens received from swap, skipping burn");
      return;
    }

    await burnTokens(received);
    logger.info("Cycle complete", {
      tokensBurned: formatUnits(received, config.tokenDecimals),
    });
  } catch (err) {
    logger.error("Cycle failed", { error: (err as Error).message });
  } finally {
    running = false;
  }
}
