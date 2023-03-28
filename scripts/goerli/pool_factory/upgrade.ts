import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  if (!process.env.GOERLI_POOL_FACTORY_ADDRESS) {
    console.error("ERROR: GOERLI_POOL_FACTORY_ADDRESS not set");
    process.exit(2);
  }
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await upgrades.upgradeProxy(
    process.env.GOERLI_POOL_FACTORY_ADDRESS!,
    PoolFactory
  );
  await poolFactory.deployed();

  console.log("Pool Factory upgraded: ", poolFactory.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
