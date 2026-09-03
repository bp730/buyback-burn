import { SwapExactInSingle, URVersion } from '@uniswap/v4-sdk'
import { Actions, V4Planner } from '@uniswap/v4-sdk'
import { CommandType, RoutePlanner, UniversalRouterVersion } from '@uniswap/universal-router-sdk'
import { ethers } from 'ethers'
import { config } from './config.js';
import { UNIVERSAL_ROUTER_ABI } from './abis.js';
import { ensureApproval } from './utils.js';

const inAddr = config.ethAddress;
const outAddr = config.tokenAddress;

// Main swap function
export async function executeBuybackSwap() {
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);

    const address = await signer.getAddress();
    
    // Check ETH balance
    const balance = await provider.getBalance(address);
    console.log(`💰 ETH Balance: ${ethers.utils.formatEther(balance)} ETH`);
    
    const threshold = 0.001; // ETH;
    // If buyback wallet balance is less than 0.001 ETH, we need to buyback balance - 1
    if (parseFloat(ethers.utils.formatEther(balance)) < threshold) {
        return;
    }

    const targetBalance = ethers.utils.parseEther(threshold.toString());
    const amountIn = balance.sub(targetBalance);
    console.log(`💰 Buyback amount in ETH: ${ethers.utils.formatEther(amountIn)} ETH`);


    const CurrentConfig: SwapExactInSingle = {
        poolKey: {
            currency0: config.ethAddress,
            currency1: config.tokenAddress,
            fee: config.fee,
            tickSpacing: config.tickSpacing,
            hooks: config.hookAddress,
        },
        zeroForOne: true,
        amountIn: amountIn.toString(), 
        amountOutMinimum: "1", // Change according to the slippage desired
        hookData: '0x'
    }
    console.log(CurrentConfig)
    const v4Planner = new V4Planner()
    const routePlanner = new RoutePlanner()

    const deadline = Math.floor(Date.now() / 1000) + 3600

    v4Planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [CurrentConfig]);
    v4Planner.addAction(Actions.SETTLE_ALL, [inAddr, CurrentConfig.amountIn]);
    v4Planner.addAction(Actions.TAKE_ALL, [outAddr, CurrentConfig.amountOutMinimum]);

    const encodedActions = v4Planner.finalize()

    routePlanner.addCommand(
        CommandType.V4_SWAP, 
        [v4Planner.actions, v4Planner.params], 
    )

    console.log(`📡 Execute Buyback`);

    // Prepare transaction
    const universalRouter = new ethers.Contract(
        config.universalRouterAddress,
        UNIVERSAL_ROUTER_ABI,
        signer
    );
    

    const txOptions = {
        value: CurrentConfig.amountIn,
        gasLimit: 1500000,
        maxFeePerGas: ethers.utils.parseUnits("0.48", "gwei"),
        maxPriorityFeePerGas: ethers.utils.parseUnits("0", "gwei")
        // maxFeePerGas: ethers.utils.parseUnits('3', 'gwei'),
        // maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei')
    };
    // Only needed for native ETH as input currency swaps
    // const txOptions: any = {
    //     value: CurrentConfig.amountIn,
    // }

    // try {
    //     await universalRouter.callStatic.execute(
    //         routePlanner.commands,
    //         [encodedActions],
    //         deadline,
    //         txOptions
    //     );

    //     console.log("ETH->MUG buyback: simulation succeeded");
    // } catch (error) {
    //     console.error("Simulation failed:");
    //     console.dir(error, { depth: null });
    // }
    
    try {
        const tx = await universalRouter.execute(
            routePlanner.commands,
            [encodedActions],
            deadline,
            txOptions
        )

        const receipt = await tx.wait()
        console.log('USDG->ETH Fee swap completed! Transaction hash:', receipt.transactionHash)
    } catch (e) {
        console.log("Take fee in ETH from USDG TX error:", e);
    }
}