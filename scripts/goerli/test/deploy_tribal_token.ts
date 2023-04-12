import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

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
