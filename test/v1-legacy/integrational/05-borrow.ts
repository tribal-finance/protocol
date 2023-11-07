import { expect } from "chai";
import { ethers, network } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { PoolFactory } from "../../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
} from "../../../lib/pool_deployments";
import testSetup from "../helpers/usdc";
import STAGES from "../helpers/stages";

describe("Borrowing", function () {
  context("from unitranche pool", function () {
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

      const feeSharingAddress = await poolFactory.feeSharingContractAddress();
      const feeSharing = await ethers.getContractAt(
        "FeeSharing",
        feeSharingAddress
      );

      const stakingAddress = await feeSharing.stakingContract();
      const staking = await ethers.getContractAt("Staking", stakingAddress);

      const platformTokenAddress = await staking.stakingToken();
      const platformToken = await ethers.getContractAt(
        "PlatformToken",
        platformTokenAddress
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
        const toDeposit = await contracts.lendingPool.minFundingCapacity();

        await usdc
          .connect(lender1)
          .approve(contracts.firstTrancheVault.address, toDeposit);
        await contracts.firstTrancheVault
          .connect(lender1)
          .deposit(toDeposit, await lender1.getAddress());

        // wait a delay such that now > openedAt + fundingPeriodSeconds is true
        const fundingPeriodSeconds = await contracts.lendingPool.fundingPeriodSeconds();
        await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
        await network.provider.send("evm_mine");
        await contracts.lendingPool
          .connect(deployer)
          .adminTransitionToFundedState();

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

    it("sends collected assets the borrower way", async function () {
      const { borrower, usdc, lendingPool } = await loadFixture(uniPoolFixture);

      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());

      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.eq(
        USDC(10000)
      );
    });

    it("moves the pool to borrowed state", async function () {
      const { borrower, usdc, lendingPool } = await loadFixture(uniPoolFixture);

      await lendingPool.connect(borrower).borrow();
      expect(await lendingPool.currentStage()).to.eq(STAGES.BORROWED);
    });
  });

  context("from duotranche pool", function () {
    async function duoPoolFixture() {
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
          .deposit(USDC(4000), lender1.address);
        await contracts.firstTrancheVault
          .connect(lender1)
          .deposit(USDC(4000), lender1.address);
        await usdc
          .connect(lender2)
          .approve(contracts.secondTrancheVault.address, USDC(2000));
        await contracts.secondTrancheVault
          .connect(lender2)
          .deposit(USDC(2000), lender2.address);

        // wait a delay such that now > openedAt + fundingPeriodSeconds is true
        const fundingPeriodSeconds = await contracts.lendingPool.fundingPeriodSeconds();
        await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
        await network.provider.send("evm_mine");
        await contracts.lendingPool
          .connect(deployer)
          .adminTransitionToFundedState();

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

      return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
    }

    it("sends collected assets the borrower way", async function () {
      const { borrower, usdc, lendingPool } = await loadFixture(duoPoolFixture);

      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());

      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.eq(
        USDC(10000)
      );
    });

    it("moves the pool to borrowed state", async function () {
      const { borrower, usdc, lendingPool } = await loadFixture(duoPoolFixture);

      await lendingPool.connect(borrower).borrow();
      expect(await lendingPool.currentStage()).to.eq(STAGES.BORROWED);
    });
  });
});
