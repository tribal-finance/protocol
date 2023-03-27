import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  const TrancheVault = await ethers.getContractFactory("TrancheVault");
  const trancheVault = await TrancheVault.deploy();

  console.log(`TrancheVault deployed to ${trancheVault.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
