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
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const constructorParams = [
    // "TestLendingPool",
    // "TEST",
    // USDC_CONTRACT_ADDRESS_GOERLI,
    // USDC(10000),
    // 365 * 24 * 60 * 60,
    // WAD("0.1"), // APY is 10%
    // WAD("0.2"), // APR is 20%
  ];
  console.log({ constructorParams });
  const pool = await LendingPool.deploy(...constructorParams);

  console.log(`Pool deployed to ${pool.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
