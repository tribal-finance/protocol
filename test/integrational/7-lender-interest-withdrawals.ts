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

describe("Lenders redeem rewards", function () {
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

        await usdc
          .connect(borrower)
          .approve(contracts.lendingPool.address, USDC(150));
        await contracts.lendingPool
          .connect(borrower)
          .borrowerPayInterest(USDC(150));

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

    context(
      "after borrower pays $150 interest and lender redeems tranche 1",
      async () => {
        it("allows borrower to withdraw $100", async () => {
          const { lendingPool, usdc, lenders } = await loadFixture(
            uniPoolFixture
          );

          const balanceBefore = await usdc.balanceOf(
            await lenders[0].getAddress()
          );
          await lendingPool.connect(lenders[0]).lenderRedeemRewardsByTranche(0);
          const balanceAfter = await usdc.balanceOf(
            await lenders[0].getAddress()
          );
          expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(100));
        });
      }
    );
  });
});
