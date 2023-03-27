import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const FirstLossCapitalVault = await ethers.getContractFactory(
    "FirstLossCapitalVault"
  );
  const flcVault = await FirstLossCapitalVault.deploy();

  console.log(`FirstLossCapitalVault deployed to ${flcVault.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
