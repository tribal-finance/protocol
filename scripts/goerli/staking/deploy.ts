import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  if (!process.env.GOERLI_AUTHORITY_ADDRESS) {
    throw new Error("GOERLI_AUTHORITY_ADDRESS must be set");
  }
  if (!process.env.GOERLI_TRIBAL_TOKEN_ADDRESS) {
    throw new Error("GOERLI_TRIBAL_TOKEN_ADDRESS must be set");
  }
  if (!process.env.GOERLI_USDC_ADDRESS) {
    throw new Error("GOERLI_USDC_ADDRESS must be set");
  }

  const Staking = await ethers.getContractFactory("Staking");
  const staking = await upgrades.deployProxy(Staking, [
    process.env.GOERLI_AUTHORITY_ADDRESS,
    process.env.GOERLI_TRIBAL_TOKEN_ADDRESS,
    process.env.GOERLI_USDC_ADDRESS,
    60,
  ]);

  await staking.deployed();
  console.log("Staking contract deployed to: ", staking.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
