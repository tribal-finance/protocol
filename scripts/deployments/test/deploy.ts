import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

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
