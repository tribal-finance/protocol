import { expect } from "chai";
import { ethers } from "hardhat";
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
} from "../../../typechain-types";
import { USDC, WAD } from "../../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
  deployPlatformToken,
} from "../../../lib/pool_deployments";
import testSetup from "../../helpers/usdc";
import STAGES from "../../helpers/stages";

describe("Full cycle sequential test in a fail state", function () {
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
    });

    it("🏛️ 2000 USDC flc deposit from the borrower", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(2000));
      await lendingPool.connect(borrower).borrowerDepositFirstLossCapital();
    });

    it("transitions to the FLC_DEPOSITED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_DEPOSITED);
    });

    it("👮 receives adminOpenPool() from deployer", async () => {
      await lendingPool.connect(deployer).adminOpenPool();
    });

    it("transitions to OPEN stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.OPEN);
    });

    it("4000 USDC deposit from lender 1", async () => {
      await usdc
        .connect(lender1)
        .approve(firstTrancheVault.address, USDC(4000));
      await firstTrancheVault
        .connect(lender1)
        .deposit(USDC(4000), await lender1.getAddress());
    });

    it("gives 4000 tranche vault tokens to lender 1", async () => {
      expect(
        await firstTrancheVault.balanceOf(await lender1.getAddress())
      ).to.equal(USDC(4000));
    });

    it("increases collectedAssets() to 4000", async () => {
      expect(await lendingPool.collectedAssets()).to.equal(USDC(4000));
    });

    it("1000 USDC deposit from lender 2", async () => {
      await usdc
        .connect(lender2)
        .approve(firstTrancheVault.address, USDC(1000));
      await firstTrancheVault
        .connect(lender2)
        .deposit(USDC(1000), await lender2.getAddress());
    });

    it("increases collectedAssets() to 5000", async () => {
      expect(await lendingPool.collectedAssets()).to.equal(USDC(5000));
    });

    it("borrower can't withdraw first loss capital", async () => {
      const balanceInitial = await usdc.balanceOf(await borrower.getAddress());
      const tx = lendingPool
        .connect(borrower)
        .borrowerRecoverFirstLossCapital();
      await expect(tx).to.be.rejectedWith("LP004");
      const balanceFinal = await usdc.balanceOf(await borrower.getAddress());
      expect(balanceFinal.sub(balanceInitial)).equals(0);
    });

    it("gets adminTransitionToFundedState() call from deployer", () => {
      lendingPool.connect(deployer).adminTransitionToFundedState();
    });

    it("transitions to the FUNDED_FAILED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FUNDING_FAILED);
    });

    it("borrower can withdraw first loss capital", async () => {
      const balanceInitial = await usdc.balanceOf(await borrower.getAddress());
      await lendingPool.connect(borrower).borrowerRecoverFirstLossCapital();
      const balanceFinal = await usdc.balanceOf(await borrower.getAddress());
      const delta = balanceFinal.sub(balanceInitial);
      expect(delta).equals(ethers.utils.parseUnits("2000", 6));
    });

    it("borrower cannot keep withdrawing first loss capital", async () => {
      const balanceInitial = await usdc.balanceOf(await borrower.getAddress());
      await lendingPool.connect(borrower).borrowerRecoverFirstLossCapital();
      const balanceFinal = await usdc.balanceOf(await borrower.getAddress());
      const delta = balanceFinal.sub(balanceInitial);
      expect(delta).equals(ethers.utils.parseUnits("0", 6));
    });

    it("borrower cannot keep withdrawing first loss capital", async () => {
      const balanceInitial = await usdc.balanceOf(await borrower.getAddress());
      await lendingPool.connect(borrower).borrowerRecoverFirstLossCapital();
      const balanceFinal = await usdc.balanceOf(await borrower.getAddress());
      const delta = balanceFinal.sub(balanceInitial);
      expect(delta).equals(ethers.utils.parseUnits("0", 6));
    });
  });
});
