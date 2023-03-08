import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  if (!process.env.AUTHORITY_ADDRESS) {
    throw new Error("AUTHORITY_ADDRESS must be set");
  }
  if (!process.env.USDC_ADDRESS) {
    throw new Error("USDC_ADDRESS must be set");
  }
  if (!process.env.STAKING_ADDRESS) {
    throw new Error("STAKING_ADDRESS must be set");
  }
  if (!process.env.FOUNDATION_ADDRESS) {
    throw new Error("FOUNDATION_ADDRESS must be set");
  }
  const FeeSharing = await ethers.getContractFactory("FeeSharing");

  const params = [
    process.env.AUTHORITY_ADDRESS,
    process.env.USDC_ADDRESS,
    [process.env.STAKING_ADDRESS, process.env.FOUNDATION_ADDRESS],
    [ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.8")],
  ];
  const feeSharing = await upgrades.deployProxy(FeeSharing, params);
  await feeSharing.deployed();
  console.log("Fee Sharing contract deployed to: ", feeSharing.address);

  console.log(
    "waiting a few blocks for the contract to be ready for verification..."
  );
  await new Promise((resolve) => setTimeout(resolve, 30000));
  console.log("verifying contract...");

  await hre.run("verify:verify", {
    address: feeSharing.address,
    constructorArguments: [],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
