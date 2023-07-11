import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  if (!process.env.AUTHORITY_ADDRESS) {
    throw new Error("AUTHORITY_ADDRESS must be set");
  }
  if (!process.env.PLATFORM_TOKEN_ADDRESS) {
    throw new Error("PLATFORM_TOKEN_ADDRESS must be set");
  }
  if (!process.env.USDC_ADDRESS) {
    throw new Error("USDC_ADDRESS must be set");
  }

  const Staking = await ethers.getContractFactory("Staking");
  const staking = await upgrades.deployProxy(Staking, [
    process.env.AUTHORITY_ADDRESS,
    process.env.PLATFORM_TOKEN_ADDRESS,
    process.env.USDC_ADDRESS,
    60,
  ]);

  await staking.deployed();
  console.log("Staking contract deployed to: ", staking.address);
  console.log(
    "waiting a few blocks for the contract to be ready for verification..."
  );
  await new Promise((resolve) => setTimeout(resolve, 30000));
  console.log("verifying contract...");

  await hre.run("verify:verify", {
    address: staking.address,
    constructorArguments: [],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
