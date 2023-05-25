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
          .approve(contracts.firstTrancheVault.address, USDC(365000));
        await contracts.firstTrancheVault
          .connect(lender1)
          .deposit(USDC(365000), await lender1.getAddress());

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
        {
          minFundingCapacity: USDC(365000),
          maxFundingCapacity: USDC(365000),
          firstLossAssets: USDC(100000),
          lendingTermSeconds: 365 * 24 * 60 * 60,
        },
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
     * - funds collected: $365,000
     * - lender 1 deposit: $365,000
     * - lending term: 365 days
     * - lender annual yield: 10%
     * - borrower annual interest rate: 15% (total: $54,750), $150/day
     * - payments expected every 30 days with 5 days grace period
     * - first loss capital: $100,000
     * - pool balance threshold: $100,000 - 35 * $150 = $94,750
     * - penalty rate: 2%
     */
    context("when there is no interest payments from the borrower", () => {
      it("has zero borrower penalty", async () => {
        const data = await loadFixture(uniPoolFixture);
        const { usdc, lendingPool, borrower } = data;
        expect(await lendingPool.borrowerPenaltyAmount()).to.be.equal(USDC(0));
        expect(await lendingPool.poolBalance()).to.be.equal(USDC(100_000));
      });

      it("has zero penalty after 30 days", async () => {
        const data = await loadFixture(uniPoolFixture);
        const { usdc, lendingPool, borrower } = data;

        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
        expect(await lendingPool.borrowerPenaltyAmount()).to.be.equal(USDC(0));
      });

      it("has zero penalty after 100 days because nobody withdrew interest", async () => {
        const data = await loadFixture(uniPoolFixture);
        const { usdc, lendingPool, borrower } = data;

        // wait 100 days
        await ethers.provider.send("evm_increaseTime", [100 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
        expect(await lendingPool.borrowerPenaltyAmount()).to.be.equal(USDC(0));
      });

      it("has penalty after 100 days when lenders did withdraw interest", async () => {
        const data = await loadFixture(uniPoolFixture);
        const { usdc, lendingPool, borrower, lenders } = data;
        const [lender1, lender2] = lenders;

        // wait 100 days
        await ethers.provider.send("evm_increaseTime", [100 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);

        // lender 1 withdraws 10000. Pool balance = 100,000 - 10,000 = 90,000
        await lendingPool
          .connect(lender1)
          .lenderRedeemRewardsByTranche(0, USDC(10000));

        // math:
        // . pool threshold = 94,750;
        // . pool balance = 90,000;
        // . interest per day = $150;
        // . we need 4,750 more to reach the threshold;
        // . that's 4,750 / 150 = 31.666 days = 31 day; (we round down)
        // . penalty = 4,750 * (1.02) ** 31 - 4750 = 4,750 * 1.847588 - 4,750 = 4,026.04687
        // . but current implementation will lose accuracy if you power 1.02 to 31 (will return 1.36..)

        console.log("penalty: ", await lendingPool.borrowerPenaltyAmount());

        expect(await lendingPool.borrowerPenaltyAmount()).to.be.gt(
          USDC(4026.04)
        );

        expect(await lendingPool.borrowerPenaltyAmount()).to.be.lt(
          USDC(4026.05)
        );
      });

      describe("when there is ~4026 USDC penalty", async () => {
        async function uniPoolFixtureWithPenalty() {
          const data = await loadFixture(uniPoolFixture);
          const { usdc, lendingPool, borrower, lenders } = data;
          const [lender1, lender2] = lenders;
          await ethers.provider.send("evm_increaseTime", [100 * 24 * 60 * 60]);
          await ethers.provider.send("evm_mine", []);

          await lendingPool
            .connect(lender1)
            .lenderRedeemRewardsByTranche(0, USDC(10000));

          // Pool penalty is now ~4026 USDC

          return data;
        }

        it("will not allow borrower to repay interest less than penalty", async () => {
          const data = await loadFixture(uniPoolFixtureWithPenalty);
          const { usdc, lendingPool, borrower } = data;

          await usdc.connect(borrower).approve(lendingPool.address, USDC(1000));
          await expect(
            lendingPool.connect(borrower).borrowerPayInterest(USDC(1000))
          ).to.be.revertedWith("LP201");
        });

        it("will allow borrower to repay interest more than penalty but less that will bring pool to healthy state", async () => {
          const data = await loadFixture(uniPoolFixtureWithPenalty);
          const { usdc, lendingPool, borrower } = data;

          // penalty: ~ 4026
          // amount to get back to healthy: 4750
          await usdc.connect(borrower).approve(lendingPool.address, USDC(5000));
          await expect(
            lendingPool.connect(borrower).borrowerPayInterest(USDC(5000))
          ).to.be.revertedWith("LP202");
        });

        it("will allow borrower to repay interest more than penalty + amount to get back to healthy", async () => {
          "LendingPool: penalty+interest will not bring pool to healthy state";
          const data = await loadFixture(uniPoolFixtureWithPenalty);
          const { usdc, lendingPool, borrower } = data;

          const penalty = await lendingPool.borrowerPenaltyAmount();

          const outstandingInterestBefore =
            await lendingPool.borrowerOutstandingInterest();
          console.log("outstandingInterestBefore: ", outstandingInterestBefore);

          // penalty: ~ 4026
          // amount to get back to healthy: 4750
          await usdc
            .connect(borrower)
            .approve(lendingPool.address, USDC(10000));
          await expect(
            lendingPool.connect(borrower).borrowerPayInterest(USDC(10000))
          ).not.to.be.reverted;

          const outstandingInterestAfter =
            await lendingPool.borrowerOutstandingInterest();

          console.log("outstandingInterestAfter: ", outstandingInterestAfter);

          // everything but penalty went to the interest payments
          expect(
            outstandingInterestBefore.sub(outstandingInterestAfter)
          ).to.be.eq(USDC(10000).sub(penalty));
        });
      });
    });
  });
});
