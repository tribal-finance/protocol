import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import {
  FirstLossCapitalVault__factory,
  PoolFactory,
} from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployFactoryAndImplementations,
  deployUnitranchePool,
} from "../../lib/pool_deployments";

describe("PoolFactory", function () {
  async function uniPool() {
    const [deployer, lender1, lender2, lender3, borrower] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    return await deployUnitranchePool(poolFactory, deployer, borrower, lenders);
  }

  describe("When unitranche pool is deployed", async () => {
    describe("Fist loss capital vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstLossCapitalVault } = await uniPool();
        expect(await firstLossCapitalVault.depositEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.withdrawEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.transferEnabled()).to.eq(false);
      });
    });

    describe("Tranche vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.depositEnabled()).to.eq(false);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(false);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });
  });
});
