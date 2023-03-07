import { ethers } from "hardhat";

async function main() {
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy();

  await pool.deployed();

  console.log(`Pool deployed to ${pool.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
