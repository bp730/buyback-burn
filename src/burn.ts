import { ERC20_ABI, erc20Abi } from "./abis.js";
import { config } from "./config.js";
import { publicClient, walletClient } from "./clients.js";
import { logger } from "./logger.js";
import { ethers } from 'ethers'


const {
  tokenAddress,
  ethAddress,
  usdgAddress,
  hookAddress,
  universalRouterAddress,
  permit2Address,
  rpcUrl,
  privateKey
} = config;

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
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const burnToken = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      signer
    );
    const burnTx = await burnToken.burn(amount.toString())
    await burnTx.wait();
    logger.info("Burn confirmed", { hash: burnTx.hash });
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
