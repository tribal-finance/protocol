import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  if (!process.env.GOERLI_AUTHORITY_ADDRESS) {
    throw new Error("GOERLI_AUTHORITY_ADDRESS must be set");
  }
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await upgrades.deployProxy(PoolFactory, [
    process.env.GOERLI_AUTHORITY_ADDRESS,
  ]);
  await poolFactory.deployed();

  console.log("Pool Factory deployed to: ", poolFactory.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
