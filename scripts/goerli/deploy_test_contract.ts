import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  const TestContract = await ethers.getContractFactory("TestContract");
  const testContract = await TestContract.deploy();
  await testContract.initialize({
    name: "test",
    version: 1,
  });

  console.log(`TrancheVault deployed to ${testContract.address}`);

  const name = await testContract.s_name();
  console.log(`Test contract name is ${name}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
