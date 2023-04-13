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
import testSetup from "../helpers/usdc";
import STAGES from "../helpers/stages";

describe("Interests", function () {
  context("For unitranche pool", function () {
    async function uniPoolFixture() {
      const { signers, usdc } = await testSetup();
      const [deployer, lender1, lender2, lender3, borrower] = signers;
      const lenders = [lender1, lender2, lender3];

      const poolFactory: PoolFactory = await deployFactoryAndImplementations(
        deployer,
        borrower,
        lenders
      );

      const afterDeploy = async (contracts: DeployedContractsType) => {
        await contracts.lendingPool.connect(deployer).adminOpenPool();

        await usdc
          .connect(lender1)
          .approve(contracts.firstTrancheVault.address, USDC(8000));
        await contracts.firstTrancheVault
          .connect(lender1)
          .deposit(USDC(8000), await lender1.getAddress());

        await usdc
          .connect(lender2)
          .approve(contracts.firstTrancheVault.address, USDC(2000));
        await contracts.firstTrancheVault
          .connect(lender2)
          .deposit(USDC(2000), await lender1.getAddress());

        await contracts.lendingPool
          .connect(deployer)
          .adminTransitionToFundedState();

        await contracts.lendingPool.connect(borrower).borrow();

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

    /**
     * pool settings:
     * - lending term: 182.5 days ( 1/2 year )
     * - lender annual yield: 10%
     * - lender adjusted yield: 5%
     * - borrower annual interest rate: 15%
     * - borrower adjusted interest rate: 7.5%
     * - funds collected: $10,000
     * - lender 1 deposit: $8,000
     * - lender 2 deposit: $2,000
     */
    context("when there is no interest payments from the borrower", () => {
      it("calculates borrowerExpectedInterest", async () => {
        const { lendingPool } = await loadFixture(uniPoolFixture);

        expect(await lendingPool.borrowerExpectedInterest()).to.equal(
          USDC(750)
        );
      });

      it("calculates borrowerOutstandingInterest", async () => {
        const { lendingPool } = await loadFixture(uniPoolFixture);

        expect(await lendingPool.borrowerOutstandingInterest()).to.equal(
          USDC(750)
        );
      });
    });

    context("after borrower pays $150 interest", async () => {
      async function partlyRepaidFixture() {
        const data = await loadFixture(uniPoolFixture);
        const { usdc, lendingPool, borrower } = data;

        await usdc.connect(borrower).approve(lendingPool.address, USDC(150));
        await lendingPool.connect(borrower).borrowerPayInterest(USDC(150));

        return data;
      }

      it("leaves borrowerExpectedInterest unchanged", async () => {
        const { lendingPool } = await loadFixture(partlyRepaidFixture);

        expect(await lendingPool.borrowerExpectedInterest()).to.equal(
          USDC(750)
        );
      });

      it("changes borrowerOutstandingInterest", async () => {
        const { lendingPool } = await loadFixture(partlyRepaidFixture);

        expect(await lendingPool.borrowerOutstandingInterest()).to.equal(
          USDC(600)
        );
      });

      it("sets lenderRewardsByTrancheGeneratedByDate to $100", async () => {
        const { lendingPool, lenders } = await loadFixture(partlyRepaidFixture);
        const [lender1, lender2] = lenders;
        const a = await lender1.getAddress();
        const lenderRewardsByTrancheGeneratedByDate =
          await lendingPool.lenderRewardsByTrancheGeneratedByDate(a, 0);
        expect(lenderRewardsByTrancheGeneratedByDate).to.equal(USDC(100));

        const lenderRewardsByTrancheRedeemable =
          await lendingPool.lenderRewardsByTrancheRedeemable(a, 0);
        expect(lenderRewardsByTrancheRedeemable).to.equal(USDC(100));
      });

      xit("console.logs", async () => {
        const { lendingPool, lenders } = await loadFixture(partlyRepaidFixture);
        const [lender1, lender2] = lenders;

        const a = await lender1.getAddress();

        const lenderTotalExpectedRewardsByTranche =
          await lendingPool.lenderTotalExpectedRewardsByTranche(a, 0);

        const lenderRewardsByTrancheProjectedByDate =
          await lendingPool.lenderRewardsByTrancheProjectedByDate(a, 0);

        const lenderRewardsByTrancheGeneratedByDate =
          await lendingPool.lenderRewardsByTrancheGeneratedByDate(a, 0);

        const lenderRewardsByTrancheWithdrawable =
          await lendingPool.lenderRewardsByTrancheRedeemable(a, 0);

        console.log({
          lenderTotalExpectedRewardsByTranche,
          lenderRewardsByTrancheProjectedByDate,
          lenderRewardsByTrancheGeneratedByDate,
          lenderRewardsByTrancheWithdrawable,
        });
      });
    });

    context(
      "after borrower repays $750 interest (all the interest)",
      async () => {
        async function fullyRepaidFixture() {
          const data = await loadFixture(uniPoolFixture);
          const { usdc, lendingPool, borrower } = data;

          await usdc.connect(borrower).approve(lendingPool.address, USDC(750));
          await lendingPool.connect(borrower).borrowerPayInterest(USDC(750));

          return data;
        }

        it("changes borrowerOutstandingInterest", async () => {
          const { lendingPool } = await loadFixture(fullyRepaidFixture);

          expect(await lendingPool.borrowerOutstandingInterest()).to.equal(
            USDC(0)
          );
        });

        it("changes pool current stage to INTEREST_REPAID", async () => {
          const { lendingPool } = await loadFixture(fullyRepaidFixture);

          expect(await lendingPool.currentStage()).to.equal(
            STAGES.BORROWER_INTEREST_REPAID
          );
        });
      }
    );
  });
});
