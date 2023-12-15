import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../../helpers/usdc";
import {
  ITestUSDC,
  LendingPool,
  PoolFactory,
  TrancheVault,
  PlatformToken,
} from "../../../../typechain-types";
import { USDC, WAD } from "../../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
  deployPlatformToken,
} from "../../../../lib/pool_deployments";
import testSetup from "../../helpers/usdc";
import STAGES from "../../helpers/stages";

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
      lender2: Signer;

    before(async () => {
      const data = await loadFixture(uniPoolFixture);
      usdc = data.usdc;
      platformToken = data.platformToken;
      lendingPool = data.lendingPool;
      firstTrancheVault = data.firstTrancheVault;
      deployer = data.deployer;
      borrower = data.borrower;
      lender1 = data.lenders[0];
      lender2 = data.lenders[1];
    });

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
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
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

    it("sets lenderTotalExpectedRewardsByTranche for lender1 to 525 (3000 * 1/2 year * 10%) + (5000 * 1/2 year * 15%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender1.getAddress(),
          0
        )
      ).to.equal(USDC(525));
    });

    it("sets allLendersInterest() to 625 USDC", async () => {
      expect(await lendingPool.allLendersInterest()).to.equal(USDC(625));

      expect(await lendingPool.lenderRewardsByTrancheGeneratedByDate(await lender1.getAddress(), 0)).equals(0)
    });

    it("👮 gets adminTransitionToFundedState() call from deployer", async () => {

      await expect(lendingPool.connect(deployer).adminTransitionToFundedState()).to.be.revertedWith("Cannot accrue interest or declare failure before start time");

      // wait a delay such that now > openedAt + fundingPeriodSeconds is true
      const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
      await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
      await network.provider.send("evm_mine");

      await lendingPool.connect(deployer).adminTransitionToFundedState();
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
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
      expect(await lendingPool.borrowerPenaltyAmount()).equals(0)
    });

    it("⏳ 300 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [300 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      // lender is now deliquent
      expect(await lendingPool.borrowerPenaltyAmount()).not.equals(0)
    });

  });
});
