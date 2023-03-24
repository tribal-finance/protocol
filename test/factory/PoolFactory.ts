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

    await poolFactory.deployPool(
      {
        name: "Test Pool",
        token: "TST",
        stableCoinContractAddress: USDC_ADDRESS_6,
        minFundingCapacity: USDC(10000),
        maxFundingCapacity: USDC(12000),
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
      },
      [WAD(1)]
    );

    const lastDeployedPoolRecord = await poolFactory.lastDeployedPoolRecord();

    const unitranchePool = await ethers.getContractAt(
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

    return {
      deployer,
      poolFactory,
      unitranchePool,
      firstLossCapitalVault,
      firstTrancheVault,
    };
  }

  describe("When unitranche pool is deployed", async () => {
    describe("First Loss Capital Vault", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { unitranchePool, firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.poolAddress()).to.equal(
          unitranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.owner()).to.equal(deployer.address);
      });

      it("sets minFundingCapacity to pool.minFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.minFundingCapacity()).to.equal(
          USDC(2000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.maxFundingCapacity()).to.equal(
          USDC(2400)
        );
      });
    });

    describe("First tranche", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { unitranchePool, firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.poolAddress()).to.equal(
          unitranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.owner()).to.equal(deployer.address);
      });

      it("sets minFundingCapacity to pool.minFundingCapacity", async () => {
        let { firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.minFundingCapacity()).to.equal(
          USDC(10000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity", async () => {
        let { firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.maxFundingCapacity()).to.equal(
          USDC(12000)
        );
      });
    });
  });
});
