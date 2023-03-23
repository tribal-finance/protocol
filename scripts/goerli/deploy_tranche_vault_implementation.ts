import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";

dotenv.config();
const { parseUnits } = ethers.utils;

const USDC_CONTRACT_ADDRESS_GOERLI =
  "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";

const USDC_PRECISION = 6;
const USDC = (amount: string | number) =>
  parseUnits(amount.toString(), USDC_PRECISION);

const WAD_PRECISION = 18;
const WAD = (amount: string | number) =>
  parseUnits(amount.toString(), WAD_PRECISION);

async function main() {
  const TrancheVault = await ethers.getContractFactory("TrancheVault");
  const trancheVault = await TrancheVault.deploy();

  console.log(`TrancheVault deployed to ${trancheVault.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
