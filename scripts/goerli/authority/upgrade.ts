import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

async function main() {
  if (!process.env.GOERLI_AUTHORITY_ADDRESS) {
    throw new Error("GOERLI_AUTHORITY_ADDRESS should be set");
  }
  const Authority = await ethers.getContractFactory("Authority");
  const authority = await upgrades.upgradeProxy(
    process.env.GOERLI_AUTHORITY_ADDRESS,
    Authority
  );
  await authority.deployed();

  console.log("Authority upgraded: ", authority.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
