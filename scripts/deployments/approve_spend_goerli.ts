import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

const USDC_CONTRACT_ADDRESS_GOERLI =
  "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";
const POOL_ADDRESS_GOERLI = "0xdb3FCF05FfAF455eC4DB5aAea5918d7608191A1f";
const APPROVAL_AMOUNT = parseInt("10000", 6);

async function main() {
  const usdcContract = await ethers.getContractAt(
    "IERC20",
    USDC_CONTRACT_ADDRESS_GOERLI
  );

  await usdcContract.approve(POOL_ADDRESS_GOERLI, APPROVAL_AMOUNT);

  console.log(`Approved spend of USDC to pool ${POOL_ADDRESS_GOERLI}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
