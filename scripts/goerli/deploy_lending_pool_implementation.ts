import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const lp = await LendingPool.deploy();

  console.log(`LendingPool deployed to ${lp.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
