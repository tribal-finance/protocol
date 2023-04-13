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
  FirstLossCapitalVault,
  ILendingPool,
  LendingPool,
  PoolFactory,
  TrancheVault,
  TribalToken,
} from "../typechain-types";
import { pool } from "../typechain-types/contracts";
import { USDC_ADDRESS_6 } from "../test/helpers/usdc";
import { USDC, WAD } from "../test/helpers/conversion";

const { parseUnits } = ethers.utils;

const WAIT_CONFIRMATIONS = 1;

export const DEFAULT_LENDING_POOL_PARAMS = {
  name: "Test Pool",
  token: "TST",
  stableCoinContractAddress: USDC_ADDRESS_6,
  platformTokenContractAddress: USDC_ADDRESS_6,
  minFundingCapacity: USDC(10000),
  maxFundingCapacity: USDC(12000),
  fundingPeriodSeconds: 24 * 60 * 60,
  lendingTermSeconds: (365 * 24 * 60 * 60) / 2, // 1/2 of a year
  borrowerTotalInterestRateWad: WAD(0.15),
  collateralRatioWad: WAD(0.2),
  defaultPenalty: 0,
  penaltyRateWad: WAD(0.01),
  tranchesCount: 1,
  trancheAPRsWads: [WAD(0.1)],
  trancheBoostedAPRsWads: [WAD(0.1)],
  trancheBoostRatios: [ethers.utils.parseUnits("2", 12)],
  trancheCoveragesWads: [WAD(1)],
};
export const DEFAULT_MULTITRANCHE_FUNDING_SPLIT = [WAD(0.8), WAD(0.2)];

export async function deployTribalToken(
  deployer: Signer,
  lenders: Array<Signer>
): Promise<TribalToken> {
  const TribalToken = await ethers.getContractFactory("TribalToken");
  const tribalToken = await TribalToken.connect(deployer).deploy();
  await tribalToken.deployed();

  for (let lender of lenders) {
    const tx = await tribalToken
      .connect(deployer)
      .mint(await lender.getAddress(), parseUnits("1000000", "ether"));
    await tx.wait();
  }

  return tribalToken;
}

export async function deployFactoryAndImplementations(
  deployer: Signer,
  borrower: Signer,
  lenders: Array<Signer>
): Promise<PoolFactory> {
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const poolImplementation = await LendingPool.connect(deployer).deploy();
  await poolImplementation.deployed();

  const FirstLossCapitalVault = await ethers.getContractFactory(
    "FirstLossCapitalVault"
  );
  const flcImplementation = await FirstLossCapitalVault.connect(
    deployer
  ).deploy();
  await flcImplementation.deployed();

  const TrancheVault = await ethers.getContractFactory("TrancheVault");
  const trancheVaultImplementation = await TrancheVault.connect(
    deployer
  ).deploy();
  await trancheVaultImplementation.deployed();

  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await PoolFactory.connect(deployer).deploy();
  await poolFactory.deployed();

  await poolFactory.connect(deployer).initialize();
  await poolFactory
    .connect(deployer)
    .setPoolImplementation(poolImplementation.address);
  await poolFactory
    .connect(deployer)
    .setTrancheVaultImplementation(trancheVaultImplementation.address);
  await poolFactory
    .connect(deployer)
    .setFirstLossCapitalVaultImplementation(flcImplementation.address);

  return poolFactory;
}

export async function deployUnitranchePool(
  poolFactory: PoolFactory,
  deployer: Signer,
  borrower: Signer,
  lenders: Array<Signer>,
  poolInitParamsOverrides: Partial<ILendingPool.LendingPoolParamsStruct> = {},
  afterDeploy?: (
    contracts: DeployedContractsType
  ) => Promise<DeployedContractsType>
) {
  const lendingPoolParams: ILendingPool.LendingPoolParamsStruct = {
    ...DEFAULT_LENDING_POOL_PARAMS,
    ...{
      borrowerAddress: await borrower.getAddress(),
      tranchesCount: 1,
      trancheAPRsWads: [WAD(0.1)],
      trancheBoostedAPRsWads: [WAD(0.15)],
      trancheCoveragesWads: [WAD(1)],
    },
    ...poolInitParamsOverrides,
  };

  const tx = await poolFactory.deployPool(lendingPoolParams, [WAD(1)]);
  await tx.wait();

  const deployedContracts = await _getDeployedContracts(poolFactory);

  if (afterDeploy) {
    await afterDeploy(deployedContracts);
  }

  return {
    deployer,
    borrower,
    lenders,
    poolFactory,
    ...deployedContracts,
  };
}

export async function deployDuotranchePool(
  poolFactory: PoolFactory,
  deployer: Signer,
  borrower: Signer,
  lenders: Array<Signer>,
  poolInitParamsOverrides: Partial<ILendingPool.LendingPoolParamsStruct> = {},
  afterDeploy?: (
    contracts: DeployedContractsType
  ) => Promise<DeployedContractsType>
) {
  const lendingPoolParams: ILendingPool.LendingPoolParamsStruct = {
    ...{},
    ...DEFAULT_LENDING_POOL_PARAMS,
    ...{
      borrowerAddress: await borrower.getAddress(),
      tranchesCount: 2,
      trancheAPRsWads: [WAD(0.1), WAD(0.12)],
      trancheBoostedAPRsWads: [WAD(0.1), WAD(0.15)],
      trancheBoostRatios: [
        ethers.utils.parseUnits("2", 12),
        ethers.utils.parseUnits("2", 12),
      ],
      trancheCoveragesWads: [WAD(1), WAD(0)],
    },
    ...poolInitParamsOverrides,
  };

  const tx = await poolFactory.deployPool(lendingPoolParams, [
    WAD(0.8),
    WAD(0.2),
  ]);

  await tx.wait();
  const deployedContracts = await _getDeployedContracts(poolFactory);

  if (afterDeploy) {
    await afterDeploy(deployedContracts);
  }

  return {
    deployer,
    borrower,
    lenders,
    poolFactory,
    ...deployedContracts,
  };
}

export type DeployedContractsType = {
  lendingPool: LendingPool;
  firstLossCapitalVault: FirstLossCapitalVault;
  firstTrancheVault: TrancheVault;
  secondTrancheVault: TrancheVault;
};

export async function _getDeployedContracts(
  poolFactory: PoolFactory
): Promise<DeployedContractsType> {
  const lastDeployedPoolRecord = await poolFactory.lastDeployedPoolRecord();
  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    lastDeployedPoolRecord.poolAddress
  );

  const firstLossCapitalVault = await ethers.getContractAt(
    "FirstLossCapitalVault",
    lastDeployedPoolRecord.firstLossCapitalVaultAddress
  );

  const firstTrancheVault = await ethers.getContractAt(
    "TrancheVault",
    lastDeployedPoolRecord.firstTrancheVaultAddress
  );

  const secondTrancheVault = await ethers.getContractAt(
    "TrancheVault",
    lastDeployedPoolRecord.secondTrancheVaultAddress
  );

  return {
    lendingPool,
    firstLossCapitalVault,
    firstTrancheVault,
    secondTrancheVault,
  };
}

// export type CommonInput = {
//   deployer: Signer;
//   lender1: Signer;
//   lender2: Signer;
//   borrower: Signer;
//   usdcContract: ERC20Upgradeable;
//   poolFactoryContract: PoolFactory;
// };

// export async function _deployPool(
//   name: string,
//   poolDuration: BigNumberish,
//   amount: BigNumberish,
//   {
//     deployer,
//     lender1,
//     lender2,
//     borrower,
//     usdcContract,
//     poolFactoryContract,
//   }: CommonInput
// ): Promise<string> {
//   console.log("* deploying pool");
//   await poolFactoryContract
//     .connect(deployer)
//     .deployUnitranchePool(
//       name + "2",
//       "TST",
//       usdcContract.address,
//       amount,
//       poolDuration,
//       parseUnits("0.1", 18),
//       parseUnits("0.2", 18),
//       await borrower.getAddress()
//     );

//   const { poolAddress } = await poolFactoryContract.lastDeployedPoolRecord();
//   console.log(
//     "* pool address: https://goerli.etherscan.io/address/" +
//       ethers.utils.hexlify(poolAddress)
//   );
//   return poolAddress;
// }

// async function _lender1Deposit800(
//   poolContract: LendingPool,
//   params: CommonInput
// ) {
//   const { usdcContract, lender1 } = params;
//   console.log("* set allowance for lender 1");
//   await (
//     await usdcContract
//       .connect(lender1)
//       .increaseAllowance(poolContract.address, parseUnits("800", 6))
//   ).wait(WAIT_CONFIRMATIONS);

//   console.log("* deposit $800 from lender 1");
//   await (
//     await poolContract
//       .connect(lender1)
//       .deposit(parseUnits("800", 6), await lender1.getAddress())
//   ).wait(WAIT_CONFIRMATIONS);
// }

// async function _lender2Deposit200(
//   poolContract: LendingPool,
//   params: CommonInput
// ) {
//   const { usdcContract, lender2 } = params;
//   console.log("* set allowance for lender 2");
//   await (
//     await usdcContract
//       .connect(lender2)
//       .increaseAllowance(poolContract.address, parseUnits("200", 6))
//   ).wait(WAIT_CONFIRMATIONS);
//   console.log("* deposit $200 from lender 2");
//   await (
//     await poolContract
//       .connect(lender2)
//       .deposit(parseUnits("200", 6), await lender2.getAddress())
//   ).wait(WAIT_CONFIRMATIONS + 5);
// }

// async function _borrowerBorrows(
//   poolContract: LendingPool,
//   params: CommonInput
// ) {
//   const { usdcContract, borrower } = params;
//   console.log("* borrow as borrower");
//   await (
//     await poolContract.connect(borrower).borrow()
//   ).wait(WAIT_CONFIRMATIONS);
// }

// async function _borrowerPays50Interest(
//   poolContract: LendingPool,
//   params: CommonInput
// ) {
//   const { usdcContract, borrower } = params;
//   console.log("* approve spend $50 for borrower");
//   await (
//     await usdcContract
//       .connect(borrower)
//       .increaseAllowance(poolContract.address, parseUnits("50", 6))
//   ).wait(WAIT_CONFIRMATIONS);
//   console.log("* borrower pays 50 interest");
//   await (
//     await poolContract
//       .connect(borrower)
//       .borrowerPayInterest(parseUnits("50", 6))
//   ).wait(WAIT_CONFIRMATIONS);
// }

// async function _borrowerPays150Interest(
//   poolContract: LendingPool,
//   params: CommonInput
// ) {
//   const { usdcContract, borrower } = params;
//   console.log("* approve spend $150 for borrower");
//   await (
//     await usdcContract
//       .connect(borrower)
//       .increaseAllowance(poolContract.address, parseUnits("150", 6))
//   ).wait(WAIT_CONFIRMATIONS);
//   console.log("* borrower pays $150 interest");
//   await (
//     await poolContract
//       .connect(borrower)
//       .borrowerPayInterest(parseUnits("150", 6))
//   ).wait(WAIT_CONFIRMATIONS);
// }

// export async function deployOpenPool(params: CommonInput): Promise<string> {
//   const address = await _deployPool(
//     "FreshPool",
//     365 * 24 * 60 * 60,
//     parseUnits("1000", 6),
//     params
//   );

//   return address;
// }

// export async function deployHalveFoundedPool(
//   params: CommonInput
// ): Promise<string> {
//   const { usdcContract, lender1 } = params;
//   const poolAddress = await _deployPool(
//     "HalveFounded",
//     365 * 24 * 60 * 60,
//     parseUnits("1000", 6),
//     params
//   );

//   const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
//   await _lender1Deposit800(poolContract, params);
//   return poolAddress;
// }

// export async function deployFoundedPool(params: CommonInput): Promise<string> {
//   const { usdcContract, lender1, lender2 } = params;
//   const poolAddress = await _deployPool(
//     "FoundedPool",
//     365 * 24 * 60 * 60,
//     parseUnits("1000", 6),
//     params
//   );

//   const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
//   await _lender1Deposit800(poolContract, params);
//   await _lender2Deposit200(poolContract, params);

//   return poolAddress;
// }

// export async function deploy5daysFoundedPool(
//   params: CommonInput
// ): Promise<string> {
//   const { usdcContract, lender1, lender2 } = params;
//   const poolAddress = await _deployPool(
//     "5 days 10k pool",
//     6 * 24 * 60 * 60,
//     parseUnits("10000", 6),
//     params
//   );

//   const poolContract = await ethers.getContractAt("LendingPool", poolAddress);

//   console.log("* set allowance for lender 1");
//   await (
//     await usdcContract
//       .connect(lender1)
//       .increaseAllowance(poolContract.address, parseUnits("10000", 6))
//   ).wait(WAIT_CONFIRMATIONS);

//   console.log("* deposit $10,000 from lender 1");
//   await (
//     await poolContract
//       .connect(lender1)
//       .deposit(parseUnits("10000", 6), await lender1.getAddress())
//   ).wait(WAIT_CONFIRMATIONS);

//   return poolAddress;
// }

// export async function deployBorrowedPool(params: CommonInput): Promise<string> {
//   const { usdcContract, lender1, lender2, borrower } = params;
//   const poolAddress = await _deployPool(
//     "BorrowedPool",
//     365 * 24 * 60 * 60,
//     parseUnits("1000", 6),
//     params
//   );

//   const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
//   await _lender1Deposit800(poolContract, params);
//   await _lender2Deposit200(poolContract, params);
//   await _borrowerBorrows(poolContract, params);

//   return poolAddress;
// }

// export async function deployBorrowedHalveInterestRepaidPool(
//   params: CommonInput
// ): Promise<string> {
//   const { usdcContract, lender1, lender2, borrower } = params;
//   const poolAddress = await _deployPool(
//     "BorrowedHalveInterstRepaidPool",
//     365 * 24 * 60 * 60,
//     parseUnits("1000", 6),
//     params
//   );

//   const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
//   await _lender1Deposit800(poolContract, params);
//   await _lender2Deposit200(poolContract, params);
//   await _borrowerBorrows(poolContract, params);
//   await _borrowerPays50Interest(poolContract, params);

//   return poolAddress;
// }

// export async function deployBorrowedFullInterestRepaidPool(
//   params: CommonInput
// ): Promise<string> {
//   const { usdcContract, lender1, lender2, borrower } = params;
//   const poolAddress = await _deployPool(
//     "BorrowedHalveInterstRepaidPool",
//     365 * 24 * 60 * 60,
//     parseUnits("1000", 6),
//     params
//   );

//   const poolContract = await ethers.getContractAt("LendingPool", poolAddress);
//   await _lender1Deposit800(poolContract, params);
//   await _lender2Deposit200(poolContract, params);
//   await _borrowerBorrows(poolContract, params);
//   await _borrowerPays50Interest(poolContract, params);
//   await _borrowerPays150Interest(poolContract, params);

//   return poolAddress;
// }
