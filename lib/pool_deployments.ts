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

import { ethers, upgrades } from "hardhat";
import type { BigNumberish, Signer } from "ethers";
import type {
  ERC20Upgradeable,
  FeeSharing,
  LendingPool,
  PoolFactory,
  TrancheVault,
  PlatformToken,
  Staking,
  Authority,
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
  lendingTermSeconds: (365 * 24 * 60 * 60) / 2, // 90 days
  firstLossAssets: USDC(2000),
  repaymentRecurrenceDays: 30,
  gracePeriodDays: 5,
  borrowerTotalInterestRateWad: WAD(0.15),
  protocolFeeWad: WAD(0.1),
  defaultPenalty: 0,
  penaltyRateWad: WAD(0.02),
  tranchesCount: 1,
  trancheAPRsWads: [WAD(0.1)],
  trancheBoostedAPRsWads: [WAD(0.1)],
  trancheBoostRatios: [ethers.utils.parseUnits("2", 12)],
  trancheCoveragesWads: [WAD(1)],
};
export const DEFAULT_MULTITRANCHE_FUNDING_SPLIT = [WAD(0.8), WAD(0.2)];

export async function deployPlatformToken(
  deployer: Signer,
  lenders: Array<Signer>,
  foundationAddress: string | null
): Promise<PlatformToken> {
  const PlatformToken = await ethers.getContractFactory("PlatformToken");
  const platformToken = await PlatformToken.connect(deployer).deploy();
  await platformToken.deployed();

  await platformToken
    .connect(deployer)
    .mint(await deployer.getAddress(), parseUnits("1000", 18));

  for (let lender of lenders) {
    const tx = await platformToken
      .connect(deployer)
      .mint(await lender.getAddress(), parseUnits("1000000", "ether"));
    await tx.wait();
  }

  if (foundationAddress) {
    const tx = await platformToken
      .connect(deployer)
      .mint(foundationAddress, parseUnits("1000000", "ether"));
  }

  return platformToken;
}

export async function deployAuthority(
  deployer: Signer,
  borrower: Signer,
  lenders: Array<Signer>,
  foundationAddress: string | null
): Promise<Authority> {
  const Authority = await ethers.getContractFactory("Authority");
  const authority = await Authority.connect(deployer).deploy();
  await authority.deployed();
  await authority.initialize();

  authority.connect(deployer).addAdmin(await deployer.getAddress());
  if (foundationAddress) {
    authority.connect(deployer).addAdmin(foundationAddress);
  }
  authority.connect(deployer).addBorrower(await borrower.getAddress());

  for (let lender of lenders) {
    authority.connect(deployer).addLender(await lender.getAddress());
  }

  return authority;
}

export async function deployStaking(
  authorityAddress: string,
  platformTokenAddress: string,
  usdcAddress: string,
  stakingPeriodSeconds: number
) {
  const Staking = await ethers.getContractFactory("Staking");
  const staking = await upgrades.deployProxy(Staking, [
    authorityAddress,
    platformTokenAddress,
    usdcAddress,
    60,
  ]);
  await staking.deployed();

  return staking;
}

export async function deployFactoryAndImplementations(
  deployer: Signer,
  borrower: Signer,
  lenders: Array<Signer>,
  foundationAddress: string
): Promise<PoolFactory> {
  const platformToken = await deployPlatformToken(
    deployer,
    lenders,
    foundationAddress
  );
  const authority = await deployAuthority(
    deployer,
    borrower,
    lenders,
    foundationAddress
  );

  const staking = await deployStaking(
    authority.address,
    platformToken.address,
    USDC_ADDRESS_6,
    60
  );

  const FeeSharing = await ethers.getContractFactory("FeeSharing");
  const feeSharing = await upgrades.deployProxy(FeeSharing, [
    authority.address,
    USDC_ADDRESS_6,
    [staking.address, foundationAddress],
    [ethers.utils.parseEther("0.2"), ethers.utils.parseEther("0.8")],
  ]);
  await feeSharing.deployed();

  const PoolCalculations = await ethers.getContractFactory("PoolCalculations");
  const poolCalculations = await PoolCalculations.deploy();
  await poolCalculations.deployed();

  const PoolTransfers = await ethers.getContractFactory("PoolTransfers");
  const poolTransfers = await PoolTransfers.deploy();
  await poolTransfers.deployed();

  const LendingPool = await ethers.getContractFactory("LendingPool", {
    libraries: {
      PoolCalculations: poolCalculations.address,
      PoolTransfers: poolTransfers.address
    }
  });
  const poolImplementation = await LendingPool.connect(deployer).deploy();
  await poolImplementation.deployed();

  const TrancheVault = await ethers.getContractFactory("TrancheVault");
  const trancheVaultImplementation = await TrancheVault.connect(
    deployer
  ).deploy();
  await trancheVaultImplementation.deployed();

  const PoolFactory = await ethers.getContractFactory("PoolFactory");
  const poolFactory = await PoolFactory.connect(deployer).deploy();
  await poolFactory.deployed();

  await poolFactory.connect(deployer).initialize(authority.address);
  await poolFactory
    .connect(deployer)
    .setPoolImplementation(poolImplementation.address);
  await poolFactory
    .connect(deployer)
    .setTrancheVaultImplementation(trancheVaultImplementation.address);

  await poolFactory
    .connect(deployer)
    .setFeeSharingContractAddress(feeSharing.address);

  return poolFactory;
}

export async function deployUnitranchePool(
  poolFactory: PoolFactory,
  deployer: Signer,
  borrower: Signer,
  lenders: Array<Signer>,
  poolInitParamsOverrides: Partial<LendingPool.LendingPoolParamsStruct> = {},
  afterDeploy?: (
    contracts: DeployedContractsType
  ) => Promise<DeployedContractsType>
) {
  const lendingPoolParams: LendingPool.LendingPoolParamsStruct = {
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

  console.log("Deployed Unitranche Pool");

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
  poolInitParamsOverrides: Partial<LendingPool.LendingPoolParamsStruct> = {},
  afterDeploy?: (
    contracts: DeployedContractsType
  ) => Promise<DeployedContractsType>
) {
  const lendingPoolParams: LendingPool.LendingPoolParamsStruct = {
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
      trancheCoveragesWads: [WAD(1), WAD(1)], // Cover 100% of tranche[0] before tranche[1] gets covered
    },
    ...poolInitParamsOverrides,
  };

  const tx = await poolFactory.deployPool(lendingPoolParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT);

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
  authority: Authority;
  lendingPool: LendingPool;
  firstTrancheVault: TrancheVault;
  secondTrancheVault: TrancheVault | null;
  feeSharing: FeeSharing;
  staking: Staking;
  platformToken: PlatformToken;
};

export async function _getDeployedContracts(
  poolFactory: PoolFactory
): Promise<DeployedContractsType> {
  const lastDeployedPoolRecord = await poolFactory.lastDeployedPoolRecord();
  const lendingPool = await ethers.getContractAt(
    "LendingPool",
    lastDeployedPoolRecord.poolAddress
  );

  const firstTrancheVault = await ethers.getContractAt(
    "TrancheVault",
    lastDeployedPoolRecord.firstTrancheVaultAddress
  );

  let secondTrancheVault: TrancheVault | null = null;

  if ((await lendingPool.tranchesCount()) > 1) {
    secondTrancheVault = await ethers.getContractAt(
      "TrancheVault",
      lastDeployedPoolRecord.secondTrancheVaultAddress
    );
  }

  const authorityAddress = await poolFactory.authority();
  const authority = await ethers.getContractAt("Authority", authorityAddress);

  const feeSharingAddress = await poolFactory.feeSharingContractAddress();
  const feeSharing = await ethers.getContractAt(
    "FeeSharing",
    feeSharingAddress
  );

  const stakingAddress = await feeSharing.stakingContract();
  const staking = await ethers.getContractAt("Staking", stakingAddress);

  const platformTokenAddress = await staking.stakingToken();
  const platformToken = await ethers.getContractAt("PlatformToken", platformTokenAddress);

  return {
    authority,
    lendingPool,
    firstTrancheVault,
    secondTrancheVault,
    feeSharing,
    staking,
    platformToken,
  };
}
