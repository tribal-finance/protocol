import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { PoolFactory } from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
} from "../../lib/pool_deployments";
import STAGES from "../helpers/stages";
import testSetup from "../helpers/usdc";

describe("When Pool moves to Open state", function () {
  async function uniPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower, foundation] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const { usdc } = await testSetup();

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders,
      foundation.address
    );

    const afterDeploy = async (contracts: DeployedContractsType) => {
      await usdc
        .connect(borrower)
        .approve(
          contracts.lendingPool.address,
          await contracts.lendingPool.firstLossAssets()
        );

      await contracts.lendingPool
        .connect(borrower)
        .borrowerDepositFirstLossCapital();
      return contracts;
    };

    const data = await deployUnitranchePool(
      poolFactory,
      deployer,
      borrower,
      lenders,
      {},
      afterDeploy
    );

    await data.lendingPool.connect(deployer).adminOpenPool();

    return { ...data, ...(await _getDeployedContracts(poolFactory)) };
  }

  async function duoPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower, foundation] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];
    const { usdc } = await testSetup();

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders,
      foundation.address
    );

    const afterDeploy = async (contracts: DeployedContractsType) => {
      await usdc
        .connect(borrower)
        .approve(
          contracts.lendingPool.address,
          await contracts.lendingPool.firstLossAssets()
        );

      await contracts.lendingPool
        .connect(borrower)
        .borrowerDepositFirstLossCapital();
      return contracts;
    };

    const data = await deployDuotranchePool(
      poolFactory,
      deployer,
      borrower,
      lenders,
      {},
      afterDeploy
    );

    await data.lendingPool.connect(deployer).adminOpenPool();

    return { ...data, ...(await _getDeployedContracts(poolFactory)) };
  }

  describe("When unitranche pool opens", function () {
    it("is in OPEN stage", async () => {
      const { lendingPool } = await loadFixture(uniPoolFixture);
      expect(await lendingPool.currentStage()).to.equal(STAGES.OPEN);
    });
    describe("Tranche vault", async () => {
      it("does allows withdrawals and deposits", async () => {
        const { firstTrancheVault } = await loadFixture(uniPoolFixture);
        expect(await firstTrancheVault.depositEnabled()).to.eq(true);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(true);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });
  });

  describe("When duotranche pool opens", function () {
    describe("First Tranche vault", async () => {
      it("does allows withdrawals and deposits", async () => {
        const { firstTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await firstTrancheVault.depositEnabled()).to.eq(true);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(true);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });

    describe("Second Tranche vault", async () => {
      it("does allows withdrawals and deposits", async () => {
        const { secondTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await secondTrancheVault.depositEnabled()).to.eq(true);
        expect(await secondTrancheVault.withdrawEnabled()).to.eq(true);
        expect(await secondTrancheVault.transferEnabled()).to.eq(false);
      });
    });
  });
});
