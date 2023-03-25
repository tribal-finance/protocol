import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
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
  _getDeployedContracts,
} from "../../lib/pool_deployments";

describe("When Pool moves to Open state", function () {
  async function uniPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    const data = await deployUnitranchePool(
      poolFactory,
      deployer,
      borrower,
      lenders
    );

    await data.lendingPool.connect(deployer).openPool();

    return { ...data, ...(await _getDeployedContracts(poolFactory)) };
  }

  describe("When unitranche pool opens", function () {
    describe("Fist loss capital vault", async () => {
      it("does not allow withdrawals, deposits and transfers", async () => {
        const { firstLossCapitalVault } = await loadFixture(uniPoolFixture);
        expect(await firstLossCapitalVault.depositEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.withdrawEnabled()).to.eq(false);
        expect(await firstLossCapitalVault.transferEnabled()).to.eq(false);
      });
    });

    describe("Tranche vault", async () => {
      it("does allows withdrawals and deposits", async () => {
        const { firstTrancheVault } = await loadFixture(uniPoolFixture);
        expect(await firstTrancheVault.depositEnabled()).to.eq(true);
        expect(await firstTrancheVault.withdrawEnabled()).to.eq(true);
        expect(await firstTrancheVault.transferEnabled()).to.eq(false);
      });
    });
  });
});
