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

describe("Defaulting", function () {
  context(
    "unitranche pool where borrower puts 2000 FLC, lender1 deposits 4000, lender 2 deposits 6000",
    function () {
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

        const tribalAddress = await staking.stakingToken();
        const tribalToken = await ethers.getContractAt(
          "TribalToken",
          tribalAddress
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

          let toDeposit = await USDC(4000);
          await usdc
            .connect(lender1)
            .approve(contracts.firstTrancheVault.address, toDeposit);

          await contracts.firstTrancheVault
            .connect(lender1)
            .deposit(toDeposit, await lender1.getAddress());

          toDeposit = await USDC(6000);
          await usdc
            .connect(lender2)
            .approve(contracts.firstTrancheVault.address, toDeposit);

          await contracts.firstTrancheVault
            .connect(lender2)
            .deposit(toDeposit, await lender2.getAddress());

          await contracts.lendingPool
            .connect(deployer)
            .adminTransitionToFundedState();

          await contracts.lendingPool.connect(borrower).borrow();

          // wait for the lending term to pass by
          const toWait = await contracts.lendingPool
            .connect(deployer)
            .lendingTermSeconds();
          await ethers.provider.send("evm_increaseTime", [toWait.toNumber()]);
          await ethers.provider.send("evm_mine", []);

          await contracts.lendingPool
            .connect(deployer)
            .adminTransitionToDefaultedState();

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

      it("sets the pool to defaulted stage", async function () {
        const { lendingPool } = await loadFixture(uniPoolFixture);

        expect(await lendingPool.currentStage()).to.eq(STAGES.DEFAULTED);
      });

      it("sets default ratio on the first tranche to 0.2 (2000/10000)", async function () {
        const { firstTrancheVault } = await loadFixture(uniPoolFixture);

        expect(await firstTrancheVault.defaultRatioWad()).to.eq(WAD(0.2));
      });

      it("sets maxWithdraw for first lender to 800 (4000 * 0.2)", async function () {
        const { firstTrancheVault, lenders } = await loadFixture(
          uniPoolFixture
        );

        expect(
          await firstTrancheVault.maxWithdraw(lenders[0].getAddress())
        ).to.eq(USDC(800));
      });

      it("allows first lender to withdraw 800", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender1Address = await lenders[0].getAddress();
        const balanceBefore = await usdc.balanceOf(lender1Address);

        await firstTrancheVault
          .connect(lenders[0])
          .withdraw(USDC(800), lender1Address, lender1Address);

        const balanceAfter = await usdc.balanceOf(lender1Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(800));
      });

      it("allows first lender to redeem 4000 tranche tokens for 800 USDC", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender1Address = await lenders[0].getAddress();
        const balanceBefore = await usdc.balanceOf(lender1Address);

        await firstTrancheVault
          .connect(lenders[0])
          .redeem(USDC(4000), lender1Address, lender1Address);

        const balanceAfter = await usdc.balanceOf(lender1Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(800));
      });

      it("sets maxWithdraw for second lender to 1200 (6000 * 0.2)", async function () {
        const { firstTrancheVault, lenders } = await loadFixture(
          uniPoolFixture
        );

        expect(
          await firstTrancheVault.maxWithdraw(lenders[1].getAddress())
        ).to.eq(USDC(1200));
      });

      it("allows second lender to withdraw 1200", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender2Address = await lenders[1].getAddress();
        const balanceBefore = await usdc.balanceOf(lender2Address);

        await firstTrancheVault
          .connect(lenders[1])
          .withdraw(USDC(1200), lender2Address, lender2Address);

        const balanceAfter = await usdc.balanceOf(lender2Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(1200));
      });

      it("allows second lender to redeem 6000 tranche tokens for 1200 USDC", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender2Address = await lenders[1].getAddress();
        const balanceBefore = await usdc.balanceOf(lender2Address);

        await firstTrancheVault
          .connect(lenders[1])
          .redeem(USDC(6000), lender2Address, lender2Address);

        const balanceAfter = await usdc.balanceOf(lender2Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(1200));
      });
    }
  );

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
  });
});
