import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await upgrades.deployProxy(PoolFactory, []);
  await poolFactory.deployed();

  console.log("Pool Factory deployed to: ", poolFactory.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
