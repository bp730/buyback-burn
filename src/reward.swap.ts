import { ethers } from 'ethers'
import { config } from './config.js';
import { ERC20_ABI } from './abis.js';

const {
    tokenAddress,
    rpcUrl,
    privateKey
} = config;

export async function manualProcessRewardSwap() {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    try {
        const rewardToken = new ethers.Contract(
            tokenAddress,
            ERC20_ABI,
            signer
        );

        const canswapData = await rewardToken.canSwap();
        if (canswapData[0]) {
            console.log("RewardSwap Processing...");
            const approveTx = await rewardToken.processRewardSwap(1);

            console.log("===> RewardSwap tx:", approveTx.hash);

            await approveTx.wait();

            console.log("=> swap confirmed");
        } else {
            console.log("RewardSwap not ready");
        }
    } catch (error) {
        console.error("Reward swap failed");
        console.dir(error, { depth: null });
    }
    
}
