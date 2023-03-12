import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "./helpers/usdc";
const { parseUnits } = ethers.utils;

const WAD_PRECISION = 18;

const WAD = (amount: string | number) =>
  parseUnits(amount.toString(), WAD_PRECISION);
const USDC = (amount: string | number) =>
  parseUnits(amount.toString(), USDC_PRECISION);

const STATUS = {
  INITIAL: 0,
  OPEN: 1,
  FUNDED: 2,
  ENDED: 3,
  REPAID: 4,
  DEFAULTED: 5,
};

describe("LendingPool", function () {
  async function deploy(duration: number) {
    const { usdc, signers, signerAddresses } = await setupUSDC();
    const LendingPool = await ethers.getContractFactory("LendingPool");

    const constructorParams = [
      "TestLendingPool",
      "TEST",
      USDC_ADDRESS_6,
      USDC(10000),
      duration,
      WAD("0.1"), // APY is 10%
      WAD("0.2"), // APR is 20%
    ];
    const pool = await LendingPool.deploy();
    await pool.deployed();
    await pool.initialize(...constructorParams);

    for (let i = 0; i < 5; i++) {
      await usdc.connect(signers[i]).approve(pool.address, USDC(1000000));
    }

    return { pool, signers, usdc, signerAddresses };
  }

  function deploy73days() {
    return deploy(time.duration.days(73));
  }

  function deploy365days() {
    return deploy(time.duration.days(365));
  }

  describe("deposits", async function () {
    it("allows a user to deposit USDC up to pool target", async function () {
      const { pool, signers } = await deploy365days();
      const [poolOwner, signer] = signers;

      expect(await pool.maxDeposit(signer.address)).to.eq(USDC(10000));
    });

    it("updates max deposit when", async function () {
      const { pool, signers } = await deploy365days();
      const [poolOwner, signer] = signers;

      await pool.connect(signer).deposit(USDC(5000), signer.address);

      expect(await pool.maxDeposit(signer.address)).to.eq(USDC(5000));
    });

    it("will now allow a user to deposit more USDC than the pool target", async function () {
      const { pool, signers } = await deploy365days();
      const [poolOwner, signer] = signers;

      await expect(pool.connect(signer).deposit(USDC(10000), signer.address))
        .not.to.be.reverted;
      await expect(pool.connect(signer).deposit(USDC(1), signer.address)).to.be
        .reverted;
    });

    it("will change pool status to funded when the pool is funded", async function () {
      const { pool, signers } = await deploy365days();
      const [poolOwner, signer, signer2, signer3] = signers;

      await pool.connect(signer).deposit(USDC(5000), signer.address);
      await pool.connect(signer2).deposit(USDC(5000), signer.address);

      expect(await pool.status()).to.eq(STATUS.FUNDED);
    });
  });

  describe("security", async () => {
    describe("drain", async () => {
      it("cannot be ran unless the pool is paused", async () => {
        const { pool, signers } = await deploy365days();
        const [poolOwner, signer, signer2] = signers;

        expect(pool.drain(signer2.address)).to.be.revertedWith(
          "Pausable: not paused"
        );
      });
      it("drains all the tokens from the pool to given address", async () => {
        const { pool, signers, usdc } = await deploy365days();
        const [poolOwner, signer, signer2] = signers;

        const hunnid = USDC("100");
        await usdc.connect(signer).approve(pool.address, hunnid);
        await pool.connect(signer).deposit(hunnid, signer.address);
        await pool.pause();

        const blanaceBefore = await usdc.balanceOf(signer2.address);
        await pool.drain(signer2.address);
        const balanceAfter = await usdc.balanceOf(signer2.address);
        expect(balanceAfter.sub(blanaceBefore)).to.eq(hunnid);
      });
    });
  });

  describe("calculations", async () => {
    it("should calculate the adjusted lender APY", async () => {
      const { pool } = await loadFixture(deploy73days);
      const adjustedLenderAPY = await pool.adjustedLenderAPY();
      expect(adjustedLenderAPY).to.be.equal(parseUnits("0.02", WAD_PRECISION));
    });

    it("should calculate expected lender yield", async () => {
      const { pool } = await loadFixture(deploy73days);
      expect(await pool.expectedLenderYield()).to.be.equal(
        parseUnits("200", USDC_PRECISION)
      );
    });

    it("should calculate the adjusted borrower APR", async () => {
      const { pool } = await loadFixture(deploy73days);
      expect(await pool.adjustedBorrowerAPR()).to.be.equal(
        parseUnits("0.04", WAD_PRECISION)
      );
    });

    it("should calculate expected borrower interest", async () => {
      const { pool } = await loadFixture(deploy73days);
      expect(await pool.expectedBorrowerInterest()).to.be.equal(
        parseUnits("400", USDC_PRECISION)
      );
    });
  });
});
