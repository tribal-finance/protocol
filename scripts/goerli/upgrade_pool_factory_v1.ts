import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

const POOL_FACTORY_PROXY_ADDRESS = "0xA2B8d22eE3e373699259d9D008176dAcc4972970";

async function main() {
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await upgrades.upgradeProxy(
    POOL_FACTORY_PROXY_ADDRESS,
    PoolFactory
  );
  await poolFactory.deployed();

  console.log("Pool Factory deployed to: ", poolFactory.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
