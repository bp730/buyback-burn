import "dotenv/config";
import type { Address, Hex } from "viem";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "" || v.includes("your_") || v === "0x...") {
    throw new Error(`Missing/placeholder env var: ${name}. Check your .env file.`);
  }
  return v;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number`);
  return n;
}

export type BurnMethod = "dead" | "burnFunction";

export const config = {
  rpcUrl: required("RPC_URL"),
  chainId: optionalNumber("CHAIN_ID", 4663),

  privateKey: required("PRIVATE_KEY") as Hex,

  usdgAddress: required("USDG_ADDRESS") as Address,
  tokenAddress: required("TOKEN_ADDRESS") as Address,
  tokenDecimals: optionalNumber("TOKEN_DECIMALS", 18),

  routerAddress: required("UNISWAP_V2_ROUTER_ADDRESS") as Address,
  // How long (in seconds) a swap tx is allowed to sit before it reverts
  swapDeadlineSeconds: optionalNumber("SWAP_DEADLINE_SECONDS", 300),

  burnMethod: (process.env.BURN_METHOD as BurnMethod) || "dead",
  burnAddress: (process.env.BURN_ADDRESS ||
    "0x000000000000000000000000000000000000dEaD") as Address,

  minUsdgBalance: optionalNumber("MIN_USDG_BALANCE", 10),
  maxSlippageBps: optionalNumber("MAX_SLIPPAGE_BPS", 100),
  intervalMinutes: optionalNumber("INTERVAL_MINUTES", 5),
  dryRun: (process.env.DRY_RUN ?? "true").toLowerCase() !== "false",

  // Safety floor: never let the wallet's TOKEN balance drop below this,
  // no matter what a swap/balance computation says. Protects a permanent
  // reserve (e.g. your wallet's 2% of total supply) from ever being burnt,
  // even if a balance read is stale/wrong due to an RPC glitch.
  reserveTokenBalance: optionalNumber("RESERVE_TOKEN_BALANCE", 20000000),
  // If the computed "received" amount exceeds the quote by more than this
  // multiplier, treat it as a bad read and abort the burn rather than
  // trusting it. 2 = allow up to 2x the quoted amount before flagging.
  maxReceivedVsQuoteMultiplier: optionalNumber(
    "MAX_RECEIVED_VS_QUOTE_MULTIPLIER",
    2
  ),
};

export function assertConfigSane() {
  if (config.maxSlippageBps < 0 || config.maxSlippageBps > 5000) {
    throw new Error("MAX_SLIPPAGE_BPS should be between 0 and 5000 (50%)");
  }
  if (config.intervalMinutes <= 0) {
    throw new Error("INTERVAL_MINUTES must be > 0");
  }
  if (config.burnMethod !== "dead" && config.burnMethod !== "burnFunction") {
    throw new Error('BURN_METHOD must be "dead" or "burnFunction"');
  }
}