import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  if (!process.env.STAKING_ADDRESS) {
    throw new Error("STAKING_ADDRESS should be set");
  }
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await upgrades.upgradeProxy(
    process.env.STAKING_ADDRESS!,
    Staking
  );
  await staking.deployed();

  console.log("Staking upgraded: ", staking.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
