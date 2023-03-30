import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  const TestContract = await ethers.getContractFactory("TestContract");
  const testContract = await TestContract.deploy();
  await testContract.deployed();
  await testContract.initialize({
    name: "Test",
    version: "1",
  });

  console.log("Pool Factory deployed to: ", testContract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
