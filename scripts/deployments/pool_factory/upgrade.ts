import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  if (!process.env.POOL_FACTORY_ADDRESS) {
    console.error("ERROR: POOL_FACTORY_ADDRESS not set");
    process.exit(2);
  }
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await upgrades.upgradeProxy(
    process.env.POOL_FACTORY_ADDRESS!,
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
