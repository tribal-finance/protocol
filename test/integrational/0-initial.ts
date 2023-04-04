import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import {
  FirstLossCapitalVault__factory,
  PoolFactory,
} from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployDuotranchePool,
  deployFactoryAndImplementations,
  deployUnitranchePool,
} from "../../lib/pool_deployments";
import STAGES from "../helpers/stages";

describe("When pool is in Initial ", function () {
  async function uniPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    return await deployUnitranchePool(poolFactory, deployer, borrower, lenders);
  }

  async function duoPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    return await deployDuotranchePool(poolFactory, deployer, borrower, lenders);
  }

  describe("When unitranche pool is deployed", async () => {
    it("is in initial stage", async () => {
      const { lendingPool } = await loadFixture(uniPoolFixture);
      expect(await lendingPool.currentStage()).to.equal(STAGES.INITIAL);
    });

    describe("Fist loss capital vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstLossCapitalVault } = await loadFixture(uniPoolFixture);
        expect(await firstLossCapitalVault.depositEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.withdrawEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.transferEnabled()).to.eq(false);
      });
    });

    describe("Tranche vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstTrancheVault } = await loadFixture(uniPoolFixture);
        expect(await firstTrancheVault.depositEnabled()).to.eq(false);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(false);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });
  });

  describe("When duotranche pool is deployed", async () => {
    describe("Fist loss capital vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstLossCapitalVault } = await loadFixture(duoPoolFixture);
        expect(await firstLossCapitalVault.depositEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.withdrawEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.transferEnabled()).to.eq(false);
      });
    });

    describe("First Tranche vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await firstTrancheVault.depositEnabled()).to.eq(false);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(false);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });

    describe("Second Tranche vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await firstTrancheVault.depositEnabled()).to.eq(false);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(false);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });
  });
});
