import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  const TestContract = await ethers.getContractFactory("TestContract");
  const testContract = await upgrades.deployProxy(TestContract, [1]);
  await testContract.deployed();

  console.log("Test Contract deployed to: ", testContract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
