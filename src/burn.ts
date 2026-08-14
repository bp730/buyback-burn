import { erc20Abi } from "./abis.js";
import { config } from "./config.js";
import { publicClient, walletClient } from "./clients.js";
import { logger } from "./logger.js";

export async function burnTokens(amount: bigint) {
  if (amount <= 0n) {
    logger.warn("burnTokens called with non-positive amount, skipping");
    return;
  }

  if (config.dryRun) {
    logger.info("[DRY RUN] Would burn tokens", {
      method: config.burnMethod,
      amount: amount.toString(),
    });
    return;
  }

  if (config.burnMethod === "burnFunction") {
    logger.info("Burning via token.burn(amount)", { amount: amount.toString() });
    const hash = await walletClient.writeContract({
      address: config.tokenAddress,
      abi: erc20Abi,
      functionName: "burn",
      args: [amount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    logger.info("Burn confirmed", { hash, status: receipt.status });
    return;
  }

  // Default: send to the dead address. Works for any standard ERC20,
  // regardless of whether it implements a burn() function.
  logger.info("Burning via transfer to dead address", {
    to: config.burnAddress,
    amount: amount.toString(),
  });
  const hash = await walletClient.writeContract({
    address: config.tokenAddress,
    abi: erc20Abi,
    functionName: "transfer",
    args: [config.burnAddress, amount],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  logger.info("Burn transfer confirmed", { hash, status: receipt.status });
}
