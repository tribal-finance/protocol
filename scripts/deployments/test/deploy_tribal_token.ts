import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  const PlatformToken = await ethers.getContractFactory("PlatformToken");
  const platformToken = await PlatformToken.deploy();
  await platformToken.deployed();

  console.log("Tribal token deployed to: ", platformToken.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
