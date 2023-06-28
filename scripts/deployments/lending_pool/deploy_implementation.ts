import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  const PoolCalculations = await ethers.getContractFactory("PoolCalculations");
  const poolCalculations = await PoolCalculations.deploy();
  await poolCalculations.deployed();

  const LendingPool = await ethers.getContractFactory("LendingPool", {
    libraries: {
      PoolCalculations: poolCalculations.address,
    }
  });
  const lp = await LendingPool.deploy();

  console.log(`LendingPool implementation deployed to ${lp.address}`);
  console.log(
    "waiting a few blocks for the contract to be ready for verification..."
  );
  await new Promise((resolve) => setTimeout(resolve, 30000));
  console.log("verifying contract...");
  await hre.run("verify:verify", {
    address: lp.address,
    constructorArguments: [],
  });

  if (!process.env.POOL_FACTORY_ADDRESS) {
    console.log("POOL_FACTORY_ADDRESS is not set");
    process.exitCode = 2;
    return;
  }

  const poolFactory = await ethers.getContractAt(
    "PoolFactory",
    process.env.POOL_FACTORY_ADDRESS
  );

  await poolFactory.setPoolImplementation(lp.address);
  console.log("implementation address is set on poolFactory");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
