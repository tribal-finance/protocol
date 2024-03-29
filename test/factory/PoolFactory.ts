import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer, Contract } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { PoolFactory } from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  DEFAULT_LENDING_POOL_PARAMS,
  deployDuotranchePool,
  deployFactoryAndImplementations,
  deployUnitranchePool,
} from "../../lib/pool_deployments";

describe("PoolFactory", function () {
  async function uniPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower, foundation] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders,
      foundation.address
    );

    return await deployUnitranchePool(poolFactory, deployer, borrower, lenders);
  }

  async function duoPoolFixture() {
    const [deployer, lender1, lender2, lender3, borrower, foundation] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders,
      foundation.address
    );

    return await deployDuotranchePool(poolFactory, deployer, borrower, lenders);
  }

  describe("When unitranche pool is deployed", async () => {
    describe("First tranche", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { lendingPool, firstTrancheVault } = await loadFixture(
          uniPoolFixture
        );
        expect(await firstTrancheVault.poolAddress()).to.equal(
          lendingPool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstTrancheVault } = await loadFixture(uniPoolFixture);
        expect(await firstTrancheVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity", async () => {
        let { firstTrancheVault } = await loadFixture(uniPoolFixture);
        expect(await firstTrancheVault.minFundingCapacity()).to.equal(
          USDC(10000)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity", async () => {
        let { firstTrancheVault } = await loadFixture(uniPoolFixture);
        expect(await firstTrancheVault.maxFundingCapacity()).to.equal(
          USDC(12000)
        );
      });
    });
  });

  describe("When duo tranche pool is deployed", async () => {
    describe("First tranche", async () => {
      it("sets pool address on the first loss capital vault", async () => {
        let { lendingPool, firstTrancheVault } = await loadFixture(
          duoPoolFixture
        );
        expect(await firstTrancheVault.poolAddress()).to.equal(
          lendingPool.address
        );
      });

      it("sets deployer as a contract owner", async () => {
        let { deployer, firstTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await firstTrancheVault.owner()).to.equal(
          await deployer.getAddress()
        );
      });

      it("sets minFundingCapacity to pool.minFundingCapacity * split", async () => {
        let { firstTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await firstTrancheVault.minFundingCapacity()).to.equal(
          USDC(10000 * 0.75)
        );
      });

      it("sets maxFundingCapacity to pool.maxFundingCapacity", async () => {
        let { firstTrancheVault } = await loadFixture(duoPoolFixture);
        expect(await firstTrancheVault.maxFundingCapacity()).to.equal(
          USDC(12000 * 0.8)
        );
      });
    });
  });

  describe("Ensure poolRegistry gets cleared properly", async () => {

    let poolFactory: Contract;
    let admin: Signer;
    let addr1: Signer;
    let borrower: Signer;

    beforeEach(async () => {
      const setupData = await loadFixture(
        uniPoolFixture
      );
      admin = setupData.deployer
      addr1 = setupData.borrower
      borrower = setupData.borrower;
      poolFactory = setupData.poolFactory
    })

    it('should fail to deploy pool if borrower is not whitelisted', async () => {

      const defaultParams = DEFAULT_LENDING_POOL_PARAMS;

      const lendingPoolParams = { ...defaultParams, borrowerAddress: ((await ethers.getSigners())[10]).address };

      await expect(poolFactory.deployPool(lendingPoolParams, [[WAD(1), WAD(1)]])).to.be.revertedWith("LP023");

      await expect(poolFactory.deployPool({ ...defaultParams, borrowerAddress: await borrower.getAddress() }, [[WAD(1), WAD(1)]])).to.not.be.reverted;

    })

    it('should not allow unauthorized address to clear pool records', async function () {
      const initialSize = await poolFactory.poolRecordsLength();
      expect(await poolFactory.poolRecordsLength()).to.not.equal(0);

      await expect(poolFactory.connect(addr1).clearPoolRecords())
        .to.be.revertedWith('AA:OA');

      expect(await poolFactory.poolRecordsLength()).equals(initialSize);
    });

    it('should clear all records when called by admin', async function () {
      const initialSize = await poolFactory.poolRecordsLength();
      expect(initialSize).greaterThan(0);
      await poolFactory.connect(admin).clearPoolRecords();
      expect(await poolFactory.poolRecordsLength()).to.equal(0);
    });
  })
});
