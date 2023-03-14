/**
 * Plan:
 * - open pool
 * - open pool, halve founded
 * - funded pool
 * - borrowed pool
 * - borrowed pool, some interest repaid
 * - borrowed pool, some interest repaid and some yield withdrawn
 * - interest repaid pool
 * - repaid pool
 */

import { ethers } from "hardhat";
import type { BigNumberish, Signer } from "ethers";
import type {
  ERC20Upgradeable,
  LendingPool,
  PoolFactory,
} from "../typechain-types";
import type { IUSDC } from "../typechain-types/contracts/IUSDC";

const { parseUnits } = ethers.utils;

export type CommonInput = {
  deployer: Signer;
  lender1: Signer;
  lender2: Signer;
  borrower: Signer;
  usdcContract: ERC20Upgradeable;
  poolFactoryContract: PoolFactory;
};

export async function _deployPool(
  name: string,
  poolDuration: BigNumberish,
  {
    deployer,
    lender1,
    lender2,
    borrower,
    usdcContract,
    poolFactoryContract,
  }: CommonInput
): Promise<string> {
  const params = [
    name,
    "TST",
    usdcContract.address,
    parseUnits("1000", 6),
    poolDuration,
    parseUnits("0.1", 18),
    parseUnits("0.2", 18),
    await borrower.getAddress(),
  ];

  console.log("* deploying pool");
  await poolFactoryContract
    .connect(deployer)
    .deployUnitranchePool(
      name,
      "TST",
      usdcContract.address,
      parseUnits("1000", 6),
      poolDuration,
      parseUnits("0.1", 18),
      parseUnits("0.2", 18),
      await borrower.getAddress()
    );

  const { poolAddress } = await poolFactoryContract.lastDeployedPoolRecord();
  return poolAddress;
}

async function _lender1Deposit800(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, lender1 } = params;
  console.log("* set allowance for lender 1");
  await usdcContract
    .connect(lender1)
    .increaseAllowance(poolContract.address, parseUnits("800", 6));

  console.log("* deposit $800 from lender 1");
  await poolContract
    .connect(lender1)
    .deposit(parseUnits("800", 6), await lender1.getAddress());
}

async function _lender2Deposit200(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, lender2 } = params;
  console.log("* set allowance for lender 2");
  await usdcContract
    .connect(lender2)
    .increaseAllowance(poolContract.address, parseUnits("200", 6));
  console.log("* deposit $200 from lender 2");
  await poolContract
    .connect(lender2)
    .deposit(parseUnits("200", 6), await lender2.getAddress());
}

async function _borrowerBorrows(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, borrower } = params;
  console.log("* borrow as borrower");
  await poolContract.connect(borrower).borrow();
}

async function _borrowerPays50Interest(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, borrower } = params;
  console.log("* approve spend $50 for borrower");
  await usdcContract
    .connect(borrower)
    .increaseAllowance(poolContract.address, parseUnits("50", 6));
  console.log("* borrower pays 50 interest");
  await poolContract.connect(borrower).borrowerPayInterest(parseUnits("50", 6));
}

async function _borrowerPays150Interest(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, borrower } = params;
  console.log("* approve spend $150 for borrower");
  await usdcContract
    .connect(borrower)
    .increaseAllowance(poolContract.address, parseUnits("150", 6));
  console.log("* borrower pays $150 interest");
  await poolContract
    .connect(borrower)
    .borrowerPayInterest(parseUnits("150", 6));
}

export async function deployOpenPool(params: CommonInput): Promise<string> {
  const address = await _deployPool("FreshPool", 365 * 24 * 60 * 60, params);

  return address;
}

export async function deployHalveFoundedPool(
  params: CommonInput
): Promise<string> {
  const { usdcContract, lender1 } = params;
  const poolAddress = await _deployPool(
    "HalveFounded",
    365 * 24 * 60 * 60,
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  return poolAddress;
}

export async function deployFoundedPool(params: CommonInput): Promise<string> {
  const { usdcContract, lender1, lender2 } = params;
  const poolAddress = await _deployPool(
    "FoundedPool",
    365 * 24 * 60 * 60,
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  await _lender2Deposit200(poolContract, params);

  return poolAddress;
}

export async function deployBorrowedPool(params: CommonInput): Promise<string> {
  const { usdcContract, lender1, lender2, borrower } = params;
  const poolAddress = await _deployPool(
    "BorrowedPool",
    365 * 24 * 60 * 60,
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  await _lender2Deposit200(poolContract, params);
  await _borrowerBorrows(poolContract, params);

  await poolContract.connect(borrower).borrow();

  return poolAddress;
}

export async function deployBorrowedHalveInterestRepaidPool(
  params: CommonInput
): Promise<string> {
  const { usdcContract, lender1, lender2, borrower } = params;
  const poolAddress = await _deployPool(
    "BorrowedHalveInterstRepaidPool",
    365 * 24 * 60 * 60,
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  await _lender2Deposit200(poolContract, params);
  await _borrowerBorrows(poolContract, params);
  await _borrowerPays50Interest(poolContract, params);

  return poolAddress;
}

export async function deployBorrowedFullInterestRepaidPool(
  params: CommonInput
): Promise<string> {
  const { usdcContract, lender1, lender2, borrower } = params;
  const poolAddress = await _deployPool(
    "BorrowedHalveInterstRepaidPool",
    365 * 24 * 60 * 60,
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  await _lender2Deposit200(poolContract, params);
  await _borrowerBorrows(poolContract, params);
  await _borrowerPays50Interest(poolContract, params);
  await _borrowerPays150Interest(poolContract, params);

  return poolAddress;
}
