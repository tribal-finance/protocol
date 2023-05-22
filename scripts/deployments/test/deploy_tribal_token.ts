import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  const TribalToken = await ethers.getContractFactory("TribalToken");
  const tribalToken = await TribalToken.deploy();
  await tribalToken.deployed();

  console.log("Tribal token deployed to: ", tribalToken.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
