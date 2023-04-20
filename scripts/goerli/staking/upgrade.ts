import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  if (!process.env.GOERLI_STAKING_ADDRESS) {
    throw new Error("GOERLI_STAKING_ADDRESS should be set");
  }
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await upgrades.upgradeProxy(
    process.env.GOERLI_STAKING_ADDRESS!,
    Staking
  );
  await staking.deployed();

  console.log("Staking upgraded: ", staking.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
