import { formatUnits, parseUnits } from "viem";
import { erc20Abi } from "./abis.js";
import { config } from "./config.js";
import { account, publicClient } from "./clients.js";
import { logger } from "./logger.js";
import { executeMultiHopSwap } from "./buyback.swap.js";
import { burnTokens } from "./burn.js";
import { manualProcessRewardSwap } from "./reward.swap.js";

let running = false;

export async function runCycle() {
  if (running) {
    logger.warn("Previous cycle still running, skipping this tick");
    return;
  }
  running = true;
/*
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
    const maxSellAmount = parseUnits(String(config.maxUsdgSellAmount), usdgDecimals);
    const burnWalletInitBalance = parseUnits(String(config.burnWalletInitBalance), 18);

    const reserveFloor = parseUnits(
      String(config.reserveTokenBalance),
      config.tokenDecimals
    );

    logger.info("Cycle check", {
      usdgBalance: formatUnits(usdgBalance, usdgDecimals),
      minRequired: config.minUsdgBalance,
      tokenBalanceBefore: formatUnits(tokenBalanceBefore, config.tokenDecimals),
      reserveFloor: config.reserveTokenBalance,
    });

    // Sanity check: the pre-swap TOKEN balance should already be at or
    // above the reserve floor. If it's below, either the reserve hasn't
    // been funded yet, or something already went wrong — either way,
    // don't proceed with a swap/burn cycle until a human looks at it.
    if (tokenBalanceBefore < reserveFloor) {
      logger.error(
        "Pre-cycle TOKEN balance is below the configured reserve floor. " +
          "Refusing to run this cycle — check RPC health and wallet balance " +
          "before continuing.",
        {
          tokenBalanceBefore: formatUnits(tokenBalanceBefore, config.tokenDecimals),
          reserveFloor: config.reserveTokenBalance,
        }
      );
      return;
    }

    if (usdgBalance < minBalance) {
      logger.info("USDG balance below threshold, skipping this cycle");
      return;
    }

    const sellAmount = usdgBalance < maxSellAmount? usdgBalance: maxSellAmount;
    // Swap the entire USDG balance accumulated since last cycle.
    await executeMultiHopSwap(sellAmount.toString());

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

    console.log("Use Init walletBalance:", config.useInitWalletBalance);
    const received = tokenBalanceAfter - (config.useInitWalletBalance ? burnWalletInitBalance:  tokenBalanceBefore); // 
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
*/
  await manualProcessRewardSwap();
}
