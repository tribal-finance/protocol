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

const WAIT_CONFIRMATIONS = 1;

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
  amount: BigNumberish,
  {
    deployer,
    lender1,
    lender2,
    borrower,
    usdcContract,
    poolFactoryContract,
  }: CommonInput
): Promise<string> {
  console.log("* deploying pool");
  await poolFactoryContract
    .connect(deployer)
    .deployUnitranchePool(
      name + "2",
      "TST",
      usdcContract.address,
      amount,
      poolDuration,
      parseUnits("0.1", 18),
      parseUnits("0.2", 18),
      await borrower.getAddress()
    );

  const { poolAddress } = await poolFactoryContract.lastDeployedPoolRecord();
  console.log(
    "* pool address: https://goerli.etherscan.io/address/" +
      ethers.utils.hexlify(poolAddress)
  );
  return poolAddress;
}

async function _lender1Deposit800(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, lender1 } = params;
  console.log("* set allowance for lender 1");
  await (
    await usdcContract
      .connect(lender1)
      .increaseAllowance(poolContract.address, parseUnits("800", 6))
  ).wait(WAIT_CONFIRMATIONS);

  console.log("* deposit $800 from lender 1");
  await (
    await poolContract
      .connect(lender1)
      .deposit(parseUnits("800", 6), await lender1.getAddress())
  ).wait(WAIT_CONFIRMATIONS);
}

async function _lender2Deposit200(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, lender2 } = params;
  console.log("* set allowance for lender 2");
  await (
    await usdcContract
      .connect(lender2)
      .increaseAllowance(poolContract.address, parseUnits("200", 6))
  ).wait(WAIT_CONFIRMATIONS);
  console.log("* deposit $200 from lender 2");
  await (
    await poolContract
      .connect(lender2)
      .deposit(parseUnits("200", 6), await lender2.getAddress())
  ).wait(WAIT_CONFIRMATIONS + 5);
}

async function _borrowerBorrows(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, borrower } = params;
  console.log("* borrow as borrower");
  await (
    await poolContract.connect(borrower).borrow()
  ).wait(WAIT_CONFIRMATIONS);
}

async function _borrowerPays50Interest(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, borrower } = params;
  console.log("* approve spend $50 for borrower");
  await (
    await usdcContract
      .connect(borrower)
      .increaseAllowance(poolContract.address, parseUnits("50", 6))
  ).wait(WAIT_CONFIRMATIONS);
  console.log("* borrower pays 50 interest");
  await (
    await poolContract
      .connect(borrower)
      .borrowerPayInterest(parseUnits("50", 6))
  ).wait(WAIT_CONFIRMATIONS);
}

async function _borrowerPays150Interest(
  poolContract: LendingPool,
  params: CommonInput
) {
  const { usdcContract, borrower } = params;
  console.log("* approve spend $150 for borrower");
  await (
    await usdcContract
      .connect(borrower)
      .increaseAllowance(poolContract.address, parseUnits("150", 6))
  ).wait(WAIT_CONFIRMATIONS);
  console.log("* borrower pays $150 interest");
  await (
    await poolContract
      .connect(borrower)
      .borrowerPayInterest(parseUnits("150", 6))
  ).wait(WAIT_CONFIRMATIONS);
}

export async function deployOpenPool(params: CommonInput): Promise<string> {
  const address = await _deployPool(
    "FreshPool",
    365 * 24 * 60 * 60,
    parseUnits("1000", 6),
    params
  );

  return address;
}

export async function deployHalveFoundedPool(
  params: CommonInput
): Promise<string> {
  const { usdcContract, lender1 } = params;
  const poolAddress = await _deployPool(
    "HalveFounded",
    365 * 24 * 60 * 60,
    parseUnits("1000", 6),
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
    parseUnits("1000", 6),
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  await _lender2Deposit200(poolContract, params);

  return poolAddress;
}

export async function deploy5daysFoundedPool(
  params: CommonInput
): Promise<string> {
  const { usdcContract, lender1, lender2 } = params;
  const poolAddress = await _deployPool(
    "5 days 10k pool",
    6 * 24 * 60 * 60,
    parseUnits("10000", 6),
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);

  console.log("* set allowance for lender 1");
  await (
    await usdcContract
      .connect(lender1)
      .increaseAllowance(poolContract.address, parseUnits("10000", 6))
  ).wait(WAIT_CONFIRMATIONS);

  console.log("* deposit $10,000 from lender 1");
  await (
    await poolContract
      .connect(lender1)
      .deposit(parseUnits("10000", 6), await lender1.getAddress())
  ).wait(WAIT_CONFIRMATIONS);

  return poolAddress;
}

export async function deployBorrowedPool(params: CommonInput): Promise<string> {
  const { usdcContract, lender1, lender2, borrower } = params;
  const poolAddress = await _deployPool(
    "BorrowedPool",
    365 * 24 * 60 * 60,
    parseUnits("1000", 6),
    params
  );

  const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
  await _lender1Deposit800(poolContract, params);
  await _lender2Deposit200(poolContract, params);
  await _borrowerBorrows(poolContract, params);

  return poolAddress;
}

export async function deployBorrowedHalveInterestRepaidPool(
  params: CommonInput
): Promise<string> {
  const { usdcContract, lender1, lender2, borrower } = params;
  const poolAddress = await _deployPool(
    "BorrowedHalveInterstRepaidPool",
    365 * 24 * 60 * 60,
    parseUnits("1000", 6),
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
    parseUnits("1000", 6),
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
