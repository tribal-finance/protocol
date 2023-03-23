import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { FirstLossCapitalVault__factory } from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";

describe("PoolFactory", function () {
  async function fixture() {
    const [deployer, lender1, lender2, borrower] = await ethers.getSigners();

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const poolImplementation = await LendingPool.deploy();
    await poolImplementation.deployed();

    const FirstLossCapitalVault = await ethers.getContractFactory(
      "FirstLossCapitalVault"
    );
    const flcImplementation = await FirstLossCapitalVault.deploy();
    await flcImplementation.deployed();

    const TrancheVault = await ethers.getContractFactory("TrancheVault");
    const trancheVaultImplementation = await TrancheVault.deploy();
    await trancheVaultImplementation.deployed();

    const PoolFactory = await ethers.getContractFactory("PoolFactory");
    const poolFactory = await PoolFactory.deploy();
    await poolFactory.deployed();

    await poolFactory.initialize();
    await poolFactory.setPoolImplementation(poolImplementation.address);
    await poolFactory.setTrancheVaultImplementation(
      trancheVaultImplementation.address
    );
    await poolFactory.setFirstLossCapitalVaultImplementation(
      flcImplementation.address
    );

    await poolFactory.deployPool({
      name: "Test Pool",
      token: "TST",
      stableCoinContractAddress: USDC_ADDRESS_6,
      minFundingCapacity: USDC(1000),
      maxFundingCapacity: USDC(1200),
      fundingPeriodSeconds: 24 * 60 * 60,
      lendingTermSeconds: 12 * 30 * 24 * 60 * 60,
      borrowerAddress: borrower.address,
      borrowerTotalInterestRateWad: WAD(0.15),
      collateralRatioWad: WAD(0.2),
      defaultPenalty: 0,
      penaltyRateWad: WAD(0.01),
      tranchesCount: 1,
      trancheAPYsWads: [WAD(0.1)],
      trancheBoostedAPYsWads: [WAD(0.1)],
      trancheCoveragesWads: [WAD(1)],
    });

    const unitranchePoolAddress = (await poolFactory.lastDeployedPoolRecord())
      .poolAddress;

    return { poolFactory, unitranchePoolAddress };
  }

  describe("unitranche pool deployment", async () => {
    it("just works", async function () {
      let { poolFactory, unitranchePoolAddress } = await fixture();
    });
  });
});
