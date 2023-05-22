import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  const TrancheVault = await ethers.getContractFactory("TrancheVault");
  const tv = await TrancheVault.deploy();

  console.log(`TrancheVault implementation deployed to ${tv.address}`);

  if (!process.env.POOL_FACTORY_ADDRESS) {
    console.log("POOL_FACTORY_ADDRESS is not set");
    process.exitCode = 2;
    return;
  }

  const poolFactory = await ethers.getContractAt(
    "PoolFactory",
    process.env.POOL_FACTORY_ADDRESS
  );

  await poolFactory.setTrancheVaultImplementation(tv.address);
  console.log("implementation address is set on poolFactory");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
