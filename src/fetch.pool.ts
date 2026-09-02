import { slice } from "viem";


// const poolManagerAddress = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
// Get the keys of a pool (currency0, currency1, fee, tickSpacing, hooks)
// export const getPoolKeys = async (positionManager, poolId) => {
//   try {
//     const poolIdBytes25 = slice(poolId, 0, 25);
//     const [currency0, currency1, fee, tickSpacing, hooks] =
//       await positionManager.read.poolKeys([poolIdBytes25]);

//     return {
//       currency0,
//       currency1,
//       fee,
//       tickSpacing,
//       hooks,
//     };
//   } catch (error) {
//     console.error("Error fetching pool keys:", error);
//     return null;
//   }
// };
import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";

const currency0 = "0x0000000000000000000000000000000000000000";
const currency1 = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const fee = 10000;
const tickSpacing = 200;
const hooks = "0x0000000000000000000000000000000000000000";

const poolId = keccak256(
  encodeAbiParameters(
    parseAbiParameters(
      "address,address,uint24,int24,address"
    ),
    [
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    ]
  )
);
// const poolIdBytes25 = slice(poolId, 0, 25);
// 0xd313d79d9d6a714e7bdf02fc42a2c27ede7e51928ffd605126fe9e1192630cf8

// 0x54f7883914619af9105355bf83ed678bcf9f63560218ac61c9963b9503d0ba32

// How to get pool ID
// In real network, you can go uniswap UI. and find pool. their you can find 32bytes pool ID.
// In testnet network, first, please make transaction. and then go to transaction url, 
// there you can see logs. find swap() log, the first paramater is id(32bytes)
// this ETH/USDC pool id on sepolia 0x8439998C1A5D4EC8C7EC9B02EB25F5F41E3EB2D41EB2BEF710778A38EC12EB9D

// and then go to positionManager contract and read poolkeys using this 25bytes id
// you can find positionManager address from https://developers.uniswap.org/docs/protocols/v4/deployments
// https://sepolia.etherscan.io/token/0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4#readProxyContract
const ethusdgid = "0x946b7ba052aab58eca22590b8db05190154cd4ffe470acb247abfc14f40a0479";
const ethusdg25 = slice(ethusdgid, 0, 25);
console.log(poolId, ethusdg25);
