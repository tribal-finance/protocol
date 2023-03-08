import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  if (!process.env.AUTHORITY_ADDRESS) {
    throw new Error("AUTHORITY_ADDRESS must be set");
  }
  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await upgrades.deployProxy(PoolFactory, [
    process.env.AUTHORITY_ADDRESS,
  ]);
  await poolFactory.deployed();

  console.log("Pool Factory deployed to: ", poolFactory.address);
  console.log(
    "waiting a few blocks for the contract to be ready for verification..."
  );
  await new Promise((resolve) => setTimeout(resolve, 30000));
  console.log("verifying pool factory...");
  await hre.run("verify:verify", {
    address: poolFactory.address,
    constructorArguments: [],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
