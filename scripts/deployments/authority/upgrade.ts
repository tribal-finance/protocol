import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  if (!process.env.AUTHORITY_ADDRESS) {
    throw new Error("AUTHORITY_ADDRESS should be set");
  }
  const Authority = await ethers.getContractFactory("Authority");
  const authority = await upgrades.upgradeProxy(
    process.env.AUTHORITY_ADDRESS,
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
