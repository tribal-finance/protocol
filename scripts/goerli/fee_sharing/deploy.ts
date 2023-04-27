import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  if (!process.env.GOERLI_AUTHORITY_ADDRESS) {
    throw new Error("GOERLI_AUTHORITY_ADDRESS must be set");
  }
  if (!process.env.GOERLI_USDC_ADDRESS) {
    throw new Error("GOERLI_USDC_ADDRESS must be set");
  }
  if (!process.env.GOERLI_STAKING_ADDRESS) {
    throw new Error("GOERLI_STAKING_ADDRESS must be set");
  }
  if (!process.env.GOERLI_FOUNDATION_ADDRESS) {
    throw new Error("GOERLI_FOUNDATION_ADDRESS must be set");
  }
  const FeeSharing = await ethers.getContractFactory("FeeSharing");
  const feeSharing = await upgrades.deployProxy(FeeSharing, [
    process.env.GOERLI_AUTHORITY_ADDRESS,
    process.env.GOERLI_USDC_ADDRESS,
    [process.env.GOERLI_STAKING_ADDRESS, process.env.GOERLI_FOUNDATION_ADDRESS],
    [ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.8")],
  ]);

  await feeSharing.deployed();
  console.log("Fee Sharing contract deployed to: ", feeSharing.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
