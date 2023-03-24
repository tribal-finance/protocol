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
  async function fixture() {
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
    describe("First Loss Capital Vault", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { unitranchePool, firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.poolAddress()).to.equal(
          unitranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.minFundingCapacity()).to.equal(
          USDC(2000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await fixture();
        expect(await firstLossCapitalVault.maxFundingCapacity()).to.equal(
          USDC(2400)
        );
      });
    });

    describe("First tranche", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { unitranchePool, firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.poolAddress()).to.equal(
          unitranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity", async () => {
        let { firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.minFundingCapacity()).to.equal(
          USDC(10000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity", async () => {
        let { firstTrancheVault } = await fixture();
        expect(await firstTrancheVault.maxFundingCapacity()).to.equal(
          USDC(12000)
        );
      });
    });
  });
});
