import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const FirstLossCapitalVault = await ethers.getContractFactory(
    "FirstLossCapitalVault"
  );
  const flcv = await FirstLossCapitalVault.deploy();

  console.log(
    `FirstLossCapitalVault implementation deployed to ${flcv.address}`
  );

  if (!process.env.GOERLI_POOL_FACTORY_ADDRESS) {
    console.log("GOERLI_POOL_FACTORY_ADDRESS is not set");
    process.exitCode = 2;
    return;
  }

  const poolFactory = await ethers.getContractAt(
    "PoolFactory",
    process.env.GOERLI_POOL_FACTORY_ADDRESS
  );

  poolFactory.setFirstLossCapitalVaultImplementation(flcv.address);
  console.log("implementation address is set on poolFactory");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
