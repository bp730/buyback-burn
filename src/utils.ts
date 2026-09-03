import { ethers } from 'ethers'
import { config } from './config.js';
import { ERC20_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from './abis.js';

const {
    rpcUrl,
    privateKey,
    permit2Address,
    universalRouterAddress
} = config;

export async function ensureApproval(tokenInAddress: string, amountIn: string) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const address = await signer.getAddress();

  // 1. ERC20 → PERMIT2 APPROVAL
  // ==========================================================
  const inputToken = new ethers.Contract(
    tokenInAddress,
    ERC20_ABI,
    signer
  );

  const currentAllowance = await inputToken.allowance(
    address,
    permit2Address
  );

  if (currentAllowance.lt(amountIn)) {
    console.log("Approving Input Token to Permit2...");
    const approveTx = await inputToken.approve(
      permit2Address,
      ethers.constants.MaxUint256
    );

    console.log("ERC20 approval tx:", approveTx.hash);

    await approveTx.wait();

    console.log("=> approval confirmed");
  }

  // ==========================================================
  // 2. PERMIT2 → UNIVERSAL ROUTER APPROVAL
  // ==========================================================

  const permit2 = new ethers.Contract(
    permit2Address,
    PERMIT2_ABI,
    signer
  );

  const permit2Allowance = await permit2.allowance(
    address,
    tokenInAddress,
    universalRouterAddress
  );

  const expiration =
      Math.floor(Date.now() / 1000) + 86400;

  const needsPermit2Approval =
      permit2Allowance.amount.lt(amountIn) ||
      permit2Allowance.expiration < Math.floor(Date.now() / 1000);

  if (needsPermit2Approval) {
    console.log("Approving Universal Router through Permit2...");
    const permit2ApproveTx = await permit2.approve(
      tokenInAddress,
      universalRouterAddress,
      ethers.BigNumber.from(2).pow(160).sub(1), // MAX_UINT160,
      expiration
    );

    console.log("Permit2 approval tx:", permit2ApproveTx.hash);

    await permit2ApproveTx.wait();

    console.log("=> approval confirmed");
  }
}