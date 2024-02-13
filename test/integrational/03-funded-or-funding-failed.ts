import { expect } from "chai";
import { ethers, network } from "hardhat";
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
import testSetup from "../helpers/usdc";
import STAGES from "../helpers/stages";

describe("Marking the pool as Funded", function () {
  async function uniPoolFixture() {
    const { signers, usdc } = await testSetup();
    const [deployer, lender1, lender2, lender3, borrower, foundation] = signers;
    const lenders = [lender1, lender2, lender3];

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
      await contracts.lendingPool.connect(deployer).adminOpenPool();
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

    return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
  }

  describe("Open unitranche pool gets .adminTransitionToFundedState() call", function () {
    context("when there is not enough funding", function () {
      async function notEnoughFundingUnipoolFixture() {
        const data = await uniPoolFixture();
        const { usdc, deployer, lenders, lendingPool, firstTrancheVault } =
          data;
        const [lender1] = lenders;
        await usdc
          .connect(lender1)
          .approve(firstTrancheVault.address, USDC(3000));
        await firstTrancheVault
          .connect(lender1)
          .deposit(USDC(3000), await lender1.getAddress());

        // wait a delay such that now > openedAt + fundingPeriodSeconds is true
        const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
        await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
        await network.provider.send("evm_mine");
        await lendingPool.connect(deployer).adminTransitionToFundedState();

        return data;
      }

      it("is in FUNDING_FAILED stage", async () => {
        const { lendingPool } = await loadFixture(
          notEnoughFundingUnipoolFixture
        );
        expect(await lendingPool.currentStage()).to.equal(
          STAGES.FUNDING_FAILED
        );
      });

      it("sets fundingFailedAt", async function () {
        const { lendingPool } = await loadFixture(
          notEnoughFundingUnipoolFixture
        );
        expect(await lendingPool.fundedAt()).to.be.equal(0);
        expect(await lendingPool.fundingFailedAt()).not.to.be.equal(0);
      });

      describe("first tranche vault", async function () {
        it("has disabled deposits and transfers. it has enabled withdrawals", async function () {
          const { firstTrancheVault, lendingPool } = await loadFixture(
            notEnoughFundingUnipoolFixture
          );
          expect(await firstTrancheVault.depositEnabled()).to.eq(false);
          expect(await firstTrancheVault.withdrawEnabled()).to.eq(true);
          expect(await firstTrancheVault.transferEnabled()).to.eq(false);
        });
      });
    });

    context("when there is enough funding", function () {
      async function enoughFundingUnipoolFixture() {
        const data = await uniPoolFixture();
        const { usdc, deployer, lenders, lendingPool, firstTrancheVault } =
          data;
        const [lender1] = lenders;
        const toDeposit = await lendingPool.minFundingCapacity();

        await usdc
          .connect(lender1)
          .approve(firstTrancheVault.address, toDeposit);
        await firstTrancheVault
          .connect(lender1)
          .deposit(toDeposit, await lender1.getAddress());

        // wait a delay such that now > openedAt + fundingPeriodSeconds is true
        await expect(lendingPool.connect(deployer).adminTransitionToFundedState()).to.be.revertedWith("Cannot accrue interest or declare failure before start time");
        const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
        await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
        await network.provider.send("evm_mine");
        await lendingPool.connect(deployer).adminTransitionToFundedState();

        return data;
      }

      it("is in FUNDED stage", async () => {
        const { lendingPool } = await loadFixture(enoughFundingUnipoolFixture);
        expect(await lendingPool.currentStage()).to.equal(STAGES.FUNDED);
      });

      it("sets fundedAt", async function () {
        const { lendingPool } = await loadFixture(enoughFundingUnipoolFixture);
        expect(await lendingPool.fundedAt()).not.to.be.equal(0);
        expect(await lendingPool.fundingFailedAt()).to.be.equal(0);
      });

      it("sets collectedAssets", async function () {
        const { lendingPool } = await loadFixture(enoughFundingUnipoolFixture);
        expect(await lendingPool.fundedAt()).not.to.be.equal(0);
        expect(await lendingPool.fundingFailedAt()).to.be.equal(0);
        expect(await lendingPool.collectedAssets()).to.be.equal(
          await lendingPool.minFundingCapacity()
        );
      });

      describe("first tranche vault", async function () {
        it("has deposits disabled, withdraws disabled, transfers disabled", async function () {
          const { firstTrancheVault } = await loadFixture(
            enoughFundingUnipoolFixture
          );
          expect(await firstTrancheVault.depositEnabled()).to.eq(false);
          expect(await firstTrancheVault.withdrawEnabled()).to.eq(false);
          expect(await firstTrancheVault.transferEnabled()).to.eq(false);
        });
      });
    });
  });
});
