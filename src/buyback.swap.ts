import { SwapExactIn, PoolKey, SwapExactInSingle, URVersion } from '@uniswap/v4-sdk'
import { Actions, V4Planner } from '@uniswap/v4-sdk'
import { CommandType, RoutePlanner, UniversalRouterVersion } from '@uniswap/universal-router-sdk'
import { ethers } from 'ethers'
import { config } from './config.js';
import { ERC20_ABI, PERMIT2_ABI, UNIVERSAL_ROUTER_ABI } from './abis.js';

// Buyback and burn
// Buy USDG -> ETH -> MKT, and burn MKT
type PathKey = {
  intermediateCurrency: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  hookData: string;
};

const {
  tokenAddress,
  ethAddress,
  usdgAddress,
  hookAddress,
  universalRouterAddress,
  permit2Address,
  rpcUrl,
  privateKey,
  fee,
  tickSpacing,
  ethUsdgFee,
  ethUsdgTickSpacing,
  ethUsdgHookAddress
} = config;

const inputAddress = usdgAddress;
const outputAddress = tokenAddress;

const MKT_ETH_POOL_KEY: PoolKey = {
  currency0: ethAddress,
  currency1: tokenAddress,
  fee: fee,
  tickSpacing: tickSpacing,
  hooks: hookAddress,
};

const ETH_USDG_POOL_KEY: PoolKey = {
  currency0: ethAddress,
  currency1: usdgAddress,
  fee: ethUsdgFee,
  tickSpacing: ethUsdgTickSpacing,
  hooks: ethUsdgHookAddress,
};


export function encodeMultihopExactInPath(
  poolKeys: PoolKey[],
  currencyIn: string
): PathKey[] {
  const pathKeys: PathKey[] = []
  let currentCurrencyIn = currencyIn
  
  for (let i = 0; i < poolKeys.length; i++) {
    // Determine the output currency for this hop
    const currencyOut = currentCurrencyIn === poolKeys[i].currency0
      ? poolKeys[i].currency1
      : poolKeys[i].currency0
    
    // Create path key for this hop
    const pathKey: PathKey = {
      intermediateCurrency: currencyOut,
      fee: poolKeys[i].fee,
      tickSpacing: poolKeys[i].tickSpacing,
      hooks: poolKeys[i].hooks,
      hookData: '0x'
    }
    
    pathKeys.push(pathKey)
    currentCurrencyIn = currencyOut // Output becomes input for next hop
  }
  
  return pathKeys
}




async function ensureApproval(amountIn: string) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const address = await signer.getAddress();

  const maxApproval = ethers.utils.parseUnits("1000000000", 6);

  // 1. ERC20 → PERMIT2 APPROVAL
  // ==========================================================
  const inputToken = new ethers.Contract(
    inputAddress,
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
      maxApproval
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
    inputAddress,
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
      inputAddress,
      universalRouterAddress,
      maxApproval,
      expiration
    );

    console.log("Permit2 approval tx:", permit2ApproveTx.hash);

    await permit2ApproveTx.wait();

    console.log("=> approval confirmed");
  }
}

// Main swap function
export async function executeBuybackMultihopSwap(amountIn: string) {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const address = await signer.getAddress();
  console.log(`👤 Signer Wallet: ${address}`);

  // Check ETH balance
  const balance = await provider.getBalance(address);
  const balanceInEth = ethers.utils.formatEther(balance);
  if (parseFloat(balanceInEth) < 0.001) {
    throw new Error(`❌ Insufficient balance: ${balanceInEth} ETH. Minimum required: 0.001 ETH`);
  }


  const CurrentConfig: SwapExactIn = {
    currencyIn: inputAddress,
    path: encodeMultihopExactInPath(
      [ETH_USDG_POOL_KEY, MKT_ETH_POOL_KEY],
      usdgAddress
    ),
    amountIn: amountIn,
    amountOutMinimum: "1", // Change according to the slippage desired
    minHopPriceX36: []
  }
  console.log(CurrentConfig);
  console.log("Receive token:", outputAddress);

  const v4Planner = new V4Planner()
  v4Planner.addAction(Actions.SWAP_EXACT_IN, [CurrentConfig], URVersion.V2_1_1);
  v4Planner.addAction(Actions.SETTLE_ALL, [inputAddress, CurrentConfig.amountIn], URVersion.V2_1_1);
  v4Planner.addAction(Actions.TAKE_ALL, [outputAddress, CurrentConfig.amountOutMinimum], URVersion.V2_1_1);
  const encodedActions = v4Planner.finalize()

  const deadline = Math.floor(Date.now() / 1000) + 3600

  const routePlanner = new RoutePlanner()
  routePlanner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params], false, UniversalRouterVersion.V2_1_1)

  await ensureApproval(CurrentConfig.amountIn);

  // Prepare transaction
  const universalRouter = new ethers.Contract(
    universalRouterAddress,
    UNIVERSAL_ROUTER_ABI,
    signer
  );

  const txOptions = {
    gasLimit: 1000000,
    maxFeePerGas: ethers.utils.parseUnits("0.5", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits('0.5', 'gwei')
  };

  try {
    // await universalRouter.callStatic.execute(
    //   routePlanner.commands,
    //   [encodedActions],
    //   deadline
    //   // txOptions
    // );
    // console.log("Simulation succeeded");

    // send transaction
    const tx = await universalRouter.execute(
        routePlanner.commands,
        [encodedActions],
        deadline,
        txOptions
    )

    const receipt = await tx.wait()
    console.log('Swap completed! Transaction hash:', receipt.transactionHash)
    // Now Burn out
  } catch (error) {
    console.error("Buyback failed:");
    console.dir(error, { depth: null });
  }
}
