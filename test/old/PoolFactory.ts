import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";

const { parseUnits } = ethers.utils;

describe("PoolFactory", function () {
  async function fixture() {
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const signers = await ethers.getSigners();

    const deployParams: [
      string,
      string,
      string,
      BigNumberish,
      BigNumberish,
      BigNumberish,
      BigNumberish,
      string
    ] = [
      "TestLendingPool",
      "TEST",
      USDC_ADDRESS_6,
      parseUnits("10000", USDC_PRECISION),
      365 * 24 * 60 * 60,
      parseUnits("0.1", 18), // APY is 10%
      parseUnits("0.2", 18),
      signers[4].address,
    ];
    const pool = await LendingPool.deploy();
    await pool.deployed();

    const pool2 = await LendingPool.deploy();
    await pool2.deployed();

    const PoolFactory = await ethers.getContractFactory("PoolFactory");
    const factory = await PoolFactory.deploy();
    await factory.deployed();
    await factory.initialize();

    return { pool, pool2, factory, signers, deployParams: [...deployParams] };
  }

  describe("owner", function () {
    it("can set implementation", async function () {
      const { factory, pool, signers } = await fixture();
      await expect(factory.setImplementation(pool.address)).not.to.be.reverted;
      expect(await factory.implementationAddress()).to.be.equal(pool.address);
    });

    it("can set implementation to a new one", async function () {
      const { factory, pool, pool2, signers } = await fixture();
      await expect(factory.setImplementation(pool.address)).not.to.be.reverted;
      await expect(factory.setImplementation(pool2.address)).not.to.be.reverted;
      expect(await factory.implementationAddress()).to.be.equal(pool2.address);
    });

    it("can deploy a copy of the pool", async function () {
      const { factory, pool, signers, deployParams } = await fixture();
      deployParams[0] = "New Pool";
      await factory.setImplementation(pool.address);
      await expect(factory.deployUnitranchePool(...deployParams)).not.to.be
        .reverted;
    });

    it("will be set as the owner of a new pool", async function () {
      const { factory, pool, signers, deployParams } = await fixture();
      await factory.setImplementation(pool.address);
      await factory.deployUnitranchePool(...deployParams);
      const lastDeployedPoolRecord = await factory.lastDeployedPoolRecord();
      const newPoolAddress = lastDeployedPoolRecord.poolAddress;

      const newPool = await ethers.getContractAt("LendingPool", newPoolAddress);
      expect(await newPool.owner()).to.equal(await signers[0].getAddress());
    });

    it("will emit PoolDeployed event", async function () {
      const { factory, pool, signers, deployParams } = await fixture();
      await factory.setImplementation(pool.address);
      await expect(factory.deployUnitranchePool(...deployParams)).to.emit(
        factory,
        "PoolDeployed"
      );
    });
  });

  describe("other user", async function () {
    it("can not set implementation", async function () {
      const { factory, pool, signers } = await fixture();
      await expect(factory.connect(signers[1]).setImplementation(pool.address))
        .to.be.reverted;
    });

    it("can not deploy a copy of the pool", async function () {
      const { factory, pool, signers, deployParams } = await fixture();
      await factory.setImplementation(pool.address);
      await expect(
        factory.connect(signers[1]).deployUnitranchePool(...deployParams)
      ).to.be.reverted;
    });
  });
});
