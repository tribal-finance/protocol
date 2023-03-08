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
      const [deployer, lender1, lender2, lender3, borrower, foundation] =
        signers;
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

      return {
        ...data,
        usdc,
        foundation,
        ...(await _getDeployedContracts(poolFactory)),
      };
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

      it("sends $15 to fee sharing, after distributeFees(), fee sharing sends $3 to staking and $12 to foundation", async () => {
        const { usdc, feeSharing, tribalToken, foundation, staking, deployer } =
          await loadFixture(partlyRepaidFixture);

        expect(await usdc.balanceOf(feeSharing.address)).to.equal(USDC(15));

        // Staking a single TRIBAL token to let the math work on staking smart contract
        const toStake = ethers.utils.parseUnits("1", 18);
        await tribalToken.connect(foundation).approve(staking.address, toStake);
        await staking.connect(foundation).stake(toStake);

        // Distibute fees
        await feeSharing.connect(deployer).distributeFees();

        // After fee distribution, foundation will get $3 and staking will get $12
        expect(await usdc.balanceOf(foundation.address)).to.equal(USDC(12));
        expect(await usdc.balanceOf(staking.address)).to.equal(USDC(3));
      });

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

      it("has zero borrowerExcessSpread", async () => {
        const { lendingPool } = await loadFixture(partlyRepaidFixture);

        expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(0));
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

        it("has zero borrowerExcessSpread", async () => {
          const { lendingPool } = await loadFixture(fullyRepaidFixture);

          expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(0));
        });
      }
    );

    context(
      "after borrower repays $1000 interest (more than enough)",
      async () => {
        async function overRepaidFixture() {
          const data = await loadFixture(uniPoolFixture);
          const { usdc, lendingPool, borrower } = data;

          await usdc.connect(borrower).approve(lendingPool.address, USDC(1000));
          await lendingPool.connect(borrower).borrowerPayInterest(USDC(1000));

          return data;
        }

        it("changes borrowerOutstandingInterest to zero", async () => {
          const { lendingPool } = await loadFixture(overRepaidFixture);

          expect(await lendingPool.borrowerOutstandingInterest()).to.equal(
            USDC(0)
          );
        });

        it("changes borrowerExcessSpread to $250", async () => {
          const { lendingPool } = await loadFixture(overRepaidFixture);

          expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(250));
        });
      }
    );
  });
});
