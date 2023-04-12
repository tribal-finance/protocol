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

describe("Borrowing", function () {
  context("from unitranche pool", function () {
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
        const toDeposit = await contracts.lendingPool.minFundingCapacity();

        await usdc
          .connect(lender1)
          .approve(contracts.firstTrancheVault.address, toDeposit);
        await contracts.firstTrancheVault
          .connect(lender1)
          .deposit(toDeposit, await lender1.getAddress());

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

    it("sends collected assets minus flc the borrower way", async function () {
      const { borrower, usdc, firstLossCapitalVault, lendingPool } =
        await loadFixture(uniPoolFixture);

      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());

      // 10.000 - 20%
      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.eq(USDC(8000));
    });

    it("moves the pool to borrowed state", async function () {
      const { borrower, usdc, firstLossCapitalVault, lendingPool } =
        await loadFixture(uniPoolFixture);

      await lendingPool.connect(borrower).borrow();
      expect(await lendingPool.currentStage()).to.eq(STAGES.BORROWED);
    });
  });

  context("from duotranche pool", function () {
    async function duoPoolFixture() {
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

      await data.lendingPool.connect(deployer).adminOpenPool();

      return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
    }

    it("sends collected assets minus collateral value the borrower way", async function () {
      const { borrower, usdc, firstLossCapitalVault, lendingPool } =
        await loadFixture(duoPoolFixture);

      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());

      // 10000 - 20% collateral value
      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.eq(USDC(8000));
    });

    it("moves the pool to borrowed state", async function () {
      const { borrower, usdc, firstLossCapitalVault, lendingPool } =
        await loadFixture(duoPoolFixture);

      await lendingPool.connect(borrower).borrow();
      expect(await lendingPool.currentStage()).to.eq(STAGES.BORROWED);
    });
  });
});
