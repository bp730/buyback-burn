import { erc20Abi, uniswapV2RouterAbi } from "./abis.js";
import { config } from "./config.js";
import { account, publicClient, walletClient } from "./clients.js";
import { logger } from "./logger.js";

/**
 * Get a quote for swapping `amountIn` of USDG into TOKEN via the
 * Uniswap v2 Router's getAmountsOut (direct USDG -> TOKEN path).
 */
async function getQuote(amountIn: bigint): Promise<bigint> {
  const path = [config.usdgAddress, config.tokenAddress] as const;

  const amounts = await publicClient.readContract({
    address: config.routerAddress,
    abi: uniswapV2RouterAbi,
    functionName: "getAmountsOut",
    args: [amountIn, [...path]],
  });

  // amounts = [amountIn, amountOut] for a single-hop path
  return amounts[amounts.length - 1];
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
 * Swap `amountIn` USDG for TOKEN via Uniswap v2's fee-on-transfer-safe
 * swap function, respecting config.maxSlippageBps. Returns the quoted
 * amount of TOKEN (the actual received amount, net of any transfer tax,
 * is measured by the caller via balance delta).
 */
export async function swapUsdgForToken(amountIn: bigint): Promise<bigint> {
  const path = [config.usdgAddress, config.tokenAddress] as const;

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
      path,
    });
    return quotedOut;
  }

  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + config.swapDeadlineSeconds
  );

  // Uses the fee-on-transfer-safe variant: it doesn't return amounts and
  // doesn't internally verify the recipient's balance increased by the
  // "expected" amount, which matters if TOKEN charges a transfer fee/tax.
  // We still enforce our own slippage floor via amountOutMin, and cycle.ts
  // measures the real amount received via balance delta afterward.
  const hash = await walletClient.writeContract({
    address: config.routerAddress,
    abi: uniswapV2RouterAbi,
    functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    args: [amountIn, minOut, [...path], account.address, deadline],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  logger.info("Swap confirmed", { hash, status: receipt.status });

  return quotedOut;
}