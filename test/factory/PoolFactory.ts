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
  deployDuotranchePool,
  deployFactoryAndImplementations,
  deployUnitranchePool,
} from "../../lib/pool_deployments";

describe("PoolFactory", function () {
  async function uniPoolFixture() {
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

  async function duoPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    return await deployDuotranchePool(poolFactory, deployer, borrower, lenders);
  }

  describe("When unitranche pool is deployed", async () => {
    describe("First Loss Capital Vault", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { unitranchePool, firstLossCapitalVault } = await uniPoolFixture();
        expect(await firstLossCapitalVault.poolAddress()).to.equal(
          unitranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstLossCapitalVault } = await uniPoolFixture();
        expect(await firstLossCapitalVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await uniPoolFixture();
        expect(await firstLossCapitalVault.minFundingCapacity()).to.equal(
          USDC(2000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await uniPoolFixture();
        expect(await firstLossCapitalVault.maxFundingCapacity()).to.equal(
          USDC(2400)
        );
      });
    });

    describe("First tranche", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { unitranchePool, firstTrancheVault } = await uniPoolFixture();
        expect(await firstTrancheVault.poolAddress()).to.equal(
          unitranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstTrancheVault } = await uniPoolFixture();
        expect(await firstTrancheVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity", async () => {
        let { firstTrancheVault } = await uniPoolFixture();
        expect(await firstTrancheVault.minFundingCapacity()).to.equal(
          USDC(10000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity", async () => {
        let { firstTrancheVault } = await uniPoolFixture();
        expect(await firstTrancheVault.maxFundingCapacity()).to.equal(
          USDC(12000)
        );
      });
    });
  });

  describe("When duo tranche pool is deployed", async () => {
    describe("First Loss Capital Vault", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { duotranchePool, firstLossCapitalVault } = await duoPoolFixture();
        expect(await firstLossCapitalVault.poolAddress()).to.equal(
          duotranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstLossCapitalVault } = await duoPoolFixture();
        expect(await firstLossCapitalVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await duoPoolFixture();
        expect(await firstLossCapitalVault.minFundingCapacity()).to.equal(
          USDC(2000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity * collateralRatio", async () => {
        let { firstLossCapitalVault } = await duoPoolFixture();
        expect(await firstLossCapitalVault.maxFundingCapacity()).to.equal(
          USDC(2400)
        );
      });
    });

    describe("First tranche", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { duotranchePool, firstTrancheVault } = await duoPoolFixture();
        expect(await firstTrancheVault.poolAddress()).to.equal(
          duotranchePool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstTrancheVault } = await duoPoolFixture();
        expect(await firstTrancheVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity * split", async () => {
        let { firstTrancheVault } = await duoPoolFixture();
        expect(await firstTrancheVault.minFundingCapacity()).to.equal(
          USDC(10000 * 0.8)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity", async () => {
        let { firstTrancheVault } = await duoPoolFixture();
        expect(await firstTrancheVault.maxFundingCapacity()).to.equal(
          USDC(12000 * 0.8)
        );
      });
    });
  });
});
