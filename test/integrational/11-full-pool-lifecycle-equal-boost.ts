import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import {
  ITestUSDC,
  LendingPool,
  PoolFactory,
  TrancheVault,
  PlatformToken,
  FeeSharing,
} from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
  deployPlatformToken,
} from "../../lib/pool_deployments";
import testSetup from "../helpers/usdc";
import STAGES from "../helpers/stages";
import { assertDefaultRatioWad, assertPoolViews } from "../helpers/view";
import { feeSharing } from "../../typechain-types/contracts";

describe("Full cycle sequential test", function () {
  context("For unitranche pool", async function () {
    async function uniPoolFixture() {
      const { signers, usdc } = await testSetup();
      const [deployer, lender1, lender2, lender3, borrower, foundation] =
        signers;
      const lenders = [lender1, lender2, lender3];

      const platformToken = await deployPlatformToken(
        deployer,
        lenders,
        foundation.address
      );

      const poolFactory: PoolFactory = await deployFactoryAndImplementations(
        deployer,
        borrower,
        lenders,
        foundation.address
      );

      const afterDeploy = async (contracts: DeployedContractsType) => {
        return contracts;
      };

      const data = await deployUnitranchePool(
        poolFactory,
        deployer,
        borrower,
        lenders,
        {
          platformTokenContractAddress: platformToken.address,
        },
        afterDeploy
      );

      return {
        ...data,
        usdc,
        ...(await _getDeployedContracts(poolFactory)),
        platformToken,
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

    let usdc: ITestUSDC,
      platformToken: PlatformToken,
      lendingPool: LendingPool,
      firstTrancheVault: TrancheVault,
      deployer: Signer,
      borrower: Signer,
      lender1: Signer,
      failCase: number,
      feeSharing: FeeSharing,
      lender2: Signer;

    before(async () => {
      const data = await uniPoolFixture();
      usdc = data.usdc;
      platformToken = data.platformToken;
      lendingPool = data.lendingPool;
      firstTrancheVault = data.firstTrancheVault;
      deployer = data.deployer;
      borrower = data.borrower;
      lender1 = data.lenders[0];
      lender2 = data.lenders[1];
      feeSharing = data.feeSharing;

      failCase = 0;
    });

    beforeEach(async () => {
      await assertPoolViews(lendingPool, lender1, failCase++)
      await assertPoolViews(lendingPool, lender2, failCase++)
      await assertDefaultRatioWad(lendingPool);
    })

    afterEach(async () => {
      await assertPoolViews(lendingPool, lender1, failCase++)
      await assertPoolViews(lendingPool, lender2, failCase++)
      await assertDefaultRatioWad(lendingPool);
    })

    it("is initially in INITIAL stage and requires a deposit of 2000 USDC", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.INITIAL);
      expect(await lendingPool.firstLossAssets()).to.equal(USDC(2000));
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("🏛️ 2000 USDC flc deposit from the borrower", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(2000));
      await lendingPool.connect(borrower).borrowerDepositFirstLossCapital();
    });

    it("transitions to the FLC_DEPOSITED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_DEPOSITED);
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("👮 receives adminOpenPool() from deployer", async () => {
      await lendingPool.connect(deployer).adminOpenPool();
    });

    it("transitions to OPEN stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.OPEN);
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("👛 8000 USDC deposit from lender 1", async () => {
      await usdc
        .connect(lender1)
        .approve(firstTrancheVault.address, USDC(8000));
      await firstTrancheVault
        .connect(lender1)
        .deposit(USDC(8000), await lender1.getAddress());
    });

    it("gives 8000 tranche vault tokens to lender 1", async () => {
      expect(
        await firstTrancheVault.balanceOf(await lender1.getAddress())
      ).to.equal(USDC(8000));
    });

    it("increases collectedAssets() to 8000", async () => {
      expect(await lendingPool.collectedAssets()).to.equal(USDC(8000));
    });

    it("sets lenderTotalExpectedRewardsByTranche for lender1 to 400 (8000* 1/2 year * 10%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender1.getAddress(),
          0
        )
      ).to.equal(USDC(400));
    });

    it("👜 2000 USDC deposit from lender 2", async () => {
      await usdc
        .connect(lender2)
        .approve(firstTrancheVault.address, USDC(2000));
      await firstTrancheVault
        .connect(lender2)
        .deposit(USDC(2000), await lender2.getAddress());
    });

    it("sets lenderTotalExpectedRewardsByTranche for lender2 to 100 (2000* 1/2 year * 10%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender2.getAddress(),
          0
        )
      ).to.equal(USDC(100));
    });

    it("sets borrowerExpectedInterest() to 750 USDC", async () => {
      expect(await lendingPool.borrowerExpectedInterest()).to.equal(USDC(750));
    });

    it("increases collectedAssets() to 10000", async () => {
      expect(await lendingPool.collectedAssets()).to.equal(USDC(10000));
    });

    it("👛 10000 PLATFORM tokens locked by lender1", async () => {

      await platformToken
        .connect(lender1)
        .approve(lendingPool.address, WAD(10000));
      await lendingPool
        .connect(lender1)
        .lenderLockPlatformTokensByTranche(0, WAD(10000));
    });

    it("sets allLendersInterest() to 625 USDC", async () => {
      expect(await lendingPool.allLendersInterest()).to.equal(USDC(625));
      expect(await lendingPool.borrowerOutstandingInterest()).to.equal(USDC(750));

      expect(await lendingPool.lenderRewardsByTrancheGeneratedByDate(await lender1.getAddress(), 0)).equals(0)
    });

    it("10000 PLATFORM tokens locked by lender2", async () => {

      const maxBoost = await lendingPool.lenderPlatformTokensByTrancheLockable(await lender2.getAddress(), 0);
      console.log("maxboost", maxBoost);

      await platformToken
        .connect(lender2)
        .approve(lendingPool.address, maxBoost);
      await lendingPool
        .connect(lender2)
        .lenderLockPlatformTokensByTranche(0, maxBoost);
    });

    it("sets lenderTotalExpectedRewardsByTranche for lender1 to 525 (3000 * 1/2 year * 10%) + (5000 * 1/2 year * 15%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender1.getAddress(),
          0
        )
      ).to.equal(USDC(525));
    });

    it("sets allLendersInterest() to 675 USDC after boosting all parties", async () => {
      expect(await lendingPool.allLendersInterest()).to.equal(USDC(675));
      expect(await lendingPool.borrowerOutstandingInterest()).to.equal(USDC(750));

      expect(await lendingPool.lenderRewardsByTrancheGeneratedByDate(await lender1.getAddress(), 0)).equals(0)
    });

    it("👮 gets adminTransitionToFundedState() call from deployer", async () => {

      await expect(lendingPool.connect(deployer).adminTransitionToFundedState()).to.be.revertedWith("Cannot accrue interest or declare failure before start time");

      // wait a delay such that now > openedAt + fundingPeriodSeconds is true
      const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
      await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
      await network.provider.send("evm_mine");

      await lendingPool.connect(deployer).adminTransitionToFundedState();
    });

    it("transitions to the FUNDED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FUNDED);
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("pool contract now holds 12000 USDC", async () => {
      expect(await usdc.balanceOf(lendingPool.address)).to.equal(USDC(12000));
    });

    it("🏛️ borrower withdraws principal and gets 10.000 USDC", async () => {
      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
        USDC(10000)
      );
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      expect(await lendingPool.lenderRewardsByTrancheGeneratedByDate(await lender1.getAddress(), 0)).not.equals(0)
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("👛 125 USDC interest withdrawal for lender 1", async () => {
      await lendingPool.connect(lender1).lenderRedeemRewards([USDC(125)]);
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("borrowerOutstandingInterest() is now 0 (borrower already paid 750 USDC)", async () => {
      expect(await lendingPool.borrowerOutstandingInterest()).to.equal(0);
    });
    it("borrowerExcessSpread() is now 0 USDC", async () => {
      expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(0));
    });

    it("⏳ 3 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower repays 10000 USDC as principal", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(10000));
      await lendingPool.connect(borrower).borrowerRepayPrincipal();
    });

    it("transitions to REPAID stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.REPAID);
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("🏛️ borrower withdraws FLC + excess spread (2050USDC)", async () => {

      /**
       * Excess Spread = Total Interest Paid by Borrower - (Total Interest Paid to Lenders + Protocol Fees)
       * The borrower has paid a total of $750 in interest. 
       * Thus, the excess spread becomes:
       * 
       * Excess Spread=750 USDC−(675 USDC+75 USDC)
       * 
       * Expected Result: Flc Deposit + Excess Spread = $2050
       */


      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool
        .connect(borrower)
        .borrowerWithdrawFirstLossCapitalAndExcessSpread();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
        USDC(2000)
      );
    });

    it("transitions to FLC_WITHDRAWN stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_WITHDRAWN);
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("👛 400 USDC interest withdrawal for lender 1", async () => {
      await lendingPool.connect(lender1).lenderRedeemRewards([USDC(400)]);
    });

    it("👛 10000 PLATFORM tokens unlock for lender 1", async () => {
      await lendingPool
        .connect(lender1)
        .lenderUnlockPlatformTokensByTranche(0, WAD(10000));
    });

    it("👜 150 USDC interest withdraw from lender 2", async () => {
      await lendingPool.connect(lender2).lenderRedeemRewards([USDC(150)]);
    });

    it("pool balance is now drained to zero (flc, excess spread, lender 1 interest, lender 2 interest)", async () => {
      expect(await usdc.balanceOf(lendingPool.address)).to.equal(0);
    });

    it("👛 8000 usdc principal withdrawal for lender 1", async () => {
      await firstTrancheVault
        .connect(lender1)
        .withdraw(
          USDC(8000),
          await lender1.getAddress(),
          await lender1.getAddress()
        );
    });

    it("👜 2000 usdc principal withdrawal for lender 2", async () => {
      await firstTrancheVault
        .connect(lender2)
        .withdraw(
          USDC(2000),
          await lender2.getAddress(),
          await lender2.getAddress()
        );
    });

    it("Expects $75 arrived at feeSharing", async () => {
      const balance = await usdc.balanceOf(feeSharing.address);
      expect(balance).equals(USDC(75))
    })
  });
});
