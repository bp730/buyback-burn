import { erc20Abi, quoterV2Abi, swapRouter02Abi } from "./abis.js";
import { config } from "./config.js";
import { account, publicClient, walletClient } from "./clients.js";
import { logger } from "./logger.js";

/**
 * Get a quote for swapping `amountIn` of USDG into TOKEN via the
 * Uniswap v3 QuoterV2. This is a simulated (non-state-changing) call.
 */
async function getQuote(amountIn: bigint): Promise<bigint> {
  const { result } = await publicClient.simulateContract({
    address: config.quoterAddress,
    abi: quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: config.usdgAddress,
        tokenOut: config.tokenAddress,
        amountIn,
        fee: config.poolFee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  // result is [amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate]
  return result[0];
}

/**
 * Ensure the router has enough USDG allowance. Approves if needed.
 */
async function ensureAllowance(amountIn: bigint) {
  const currentAllowance = await publicClient.readContract({
    address: config.usdgAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, config.routerAddress],
  });

  if (currentAllowance >= amountIn) return;

  logger.info("Approving router to spend USDG", {
    router: config.routerAddress,
    amountIn: amountIn.toString(),
  });

  if (config.dryRun) {
    logger.info("[DRY RUN] Skipping approve tx");
    return;
  }

  const hash = await walletClient.writeContract({
    address: config.usdgAddress,
    abi: erc20Abi,
    functionName: "approve",
    args: [config.routerAddress, amountIn],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  logger.info("Approval confirmed", { hash });
}

/**
 * Swap `amountIn` USDG for TOKEN, respecting config.maxSlippageBps.
 * Returns the amount of TOKEN received (best-effort; actual amount is
 * read from the wallet's TOKEN balance delta by the caller).
 */
export async function swapUsdgForToken(amountIn: bigint): Promise<bigint> {
  const quotedOut = await getQuote(amountIn);
  const minOut =
    (quotedOut * BigInt(10_000 - config.maxSlippageBps)) / 10_000n;

  logger.info("Quote obtained", {
    amountIn: amountIn.toString(),
    quotedOut: quotedOut.toString(),
    minOut: minOut.toString(),
    maxSlippageBps: config.maxSlippageBps,
  });

  await ensureAllowance(amountIn);

  if (config.dryRun) {
    logger.info("[DRY RUN] Would swap USDG -> TOKEN", {
      amountIn: amountIn.toString(),
      minOut: minOut.toString(),
    });
    return quotedOut;
  }

  const hash = await walletClient.writeContract({
    address: config.routerAddress,
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: config.usdgAddress,
        tokenOut: config.tokenAddress,
        fee: config.poolFee,
        recipient: account.address,
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  logger.info("Swap confirmed", { hash, status: receipt.status });

  return quotedOut;
}
