import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { USDC, WAD } from "../test/helpers/conversion";
const { parseUnits } = ethers.utils;

describe("LendingPool", function () {
  async function deploy(duration: number) {
    const { usdc, signers, signerAddresses } = await setupUSDC();
    const LendingPool = await ethers.getContractFactory("LendingPool");

    const borrower = signers[4];

    const constructorParams = [
      "TestLendingPool",
      "TEST",
      USDC_ADDRESS_6,
      USDC(10000),
      duration,
      WAD("0.1"), // APR is 10%
      WAD("0.2"), // APR is 20%
      borrower.address,
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

  async function fundedPoolHalfAndHalf73days() {
    const { pool, signers, usdc, signerAddresses } = await loadFixture(
      deploy73days
    );
    const [owner, lender1, lender2, nonLender] = signers;

    await pool.connect(lender1).deposit(USDC(5000), lender1.address);
    await pool.connect(lender2).deposit(USDC(5000), lender2.address);

    return { pool, owner, lender1, lender2, nonLender, usdc, signerAddresses };
  }

  describe("deposits", async function () {
    it("allows a user to deposit USDC up to pool target", async function () {
      const { pool, signers } = await loadFixture(deploy365days);
      const [poolOwner, signer] = signers;

      expect(await pool.maxDeposit(signer.address)).to.eq(USDC(10000));
    });

    it("updates max deposit when", async function () {
      const { pool, signers } = await loadFixture(deploy365days);
      const [poolOwner, signer] = signers;

      await pool.connect(signer).deposit(USDC(5000), signer.address);

      expect(await pool.maxDeposit(signer.address)).to.eq(USDC(5000));
    });

    it("will now allow a user to deposit more USDC than the pool target", async function () {
      const { pool, signers } = await loadFixture(deploy365days);
      const [poolOwner, signer] = signers;

      await expect(pool.connect(signer).deposit(USDC(10000), signer.address))
        .not.to.be.reverted;
      await expect(pool.connect(signer).deposit(USDC(1), signer.address)).to.be
        .reverted;
    });

    it("will change pool stage to funded when the pool is funded", async function () {
      const { pool, signers } = await loadFixture(deploy365days);
      const [poolOwner, signer, signer2, signer3] = signers;

      await pool.connect(signer).deposit(USDC(5000), signer.address);
      await pool.connect(signer2).deposit(USDC(5000), signer.address);

      expect(await pool.stage()).to.eq(STAGES.FUNDED);
    });
  });

  describe("rewards", async function () {
    describe("for non-investor", async function () {
      it("rewardsGeneratedByDate() is zero at beginning of term", async function () {
        const { pool, nonLender } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        expect(
          await pool.lenderRewardsGeneratedByDate(nonLender.address)
        ).to.eq(0);
      });

      it("rewardsGeneratedByDate() is zero after halve of term", async function () {
        const { pool, nonLender } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        await time.increase(time.duration.days(73) / 2);

        expect(
          await pool.lenderRewardsGeneratedByDate(nonLender.address)
        ).to.eq(0);
      });

      it("rewardsGeneratedByDate() is zero after full term", async function () {
        const { pool, nonLender } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        await time.increase(time.duration.days(73));

        expect(
          await pool.lenderRewardsGeneratedByDate(nonLender.address)
        ).to.eq(0);
      });
    });

    describe("for investor that put 5000/10000 to 73day pool with yield=10%", async function () {
      it("rewardsGeneratedByDate() is zero at beginning of term", async function () {
        const { pool, lender1 } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        expect(await pool.lenderRewardsGeneratedByDate(lender1.address)).to.eq(
          0
        );
      });

      // 10% * 73/365/2 * 5000/10000 USDC = 50 USDC
      it("rewardsGeneratedByDate() is 50 USDC after halve of term", async function () {
        const { pool, lender1 } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        await time.increase(time.duration.days(73) / 2);

        expect(await pool.lenderRewardsGeneratedByDate(lender1.address)).to.eq(
          USDC(50)
        );
      });

      // 10% * 73/365 * 5000/10000 USDC = 100 USDC
      it("rewardsGeneratedByDate() is 100 USDC after full term", async function () {
        const { pool, lender1 } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        await time.increase(time.duration.days(73));

        expect(await pool.lenderRewardsGeneratedByDate(lender1.address)).to.eq(
          USDC(100)
        );
      });

      it("can withdraw 50USDC after halve term and withdraw another 50USDC at the end of term", async function () {
        const { usdc, pool, lender1 } = await loadFixture(
          fundedPoolHalfAndHalf73days
        );

        // half term passes
        await time.increase(time.duration.days(73) / 2);
        const balanceBefore = await usdc.balanceOf(lender1.address);
        await expect(pool.connect(lender1).lenderWithdrawRewards()).not.to.be
          .reverted;
        const balanceAfter = await usdc.balanceOf(lender1.address);
        const balanceDiff = balanceAfter.sub(balanceBefore);
        expect(balanceDiff).to.be.gte(USDC(49.99));
        expect(balanceDiff).to.lte(USDC(50.01));

        // whole lending term passes
        await time.increase(time.duration.days(73) / 2);
        const balanceBefore2 = await usdc.balanceOf(lender1.address);
        await expect(pool.connect(lender1).lenderWithdrawRewards()).not.to.be
          .reverted;
        const balanceAfter2 = await usdc.balanceOf(lender1.address);
        const balanceDiff2 = balanceAfter2.sub(balanceBefore2);
        expect(balanceDiff2).to.be.gte(USDC(49.99));
        expect(balanceDiff2).to.lte(USDC(50.01));

        const totalBalanceDiff = balanceAfter2.sub(balanceBefore);
        expect(totalBalanceDiff).to.be.eq(USDC(100));
      });
    });
  });

  describe("security", async () => {
    describe("drain", async () => {
      it("cannot be ran unless the pool is paused", async () => {
        const { pool, signers } = await loadFixture(deploy365days);
        const [poolOwner, signer, signer2] = signers;

        expect(pool.drain(signer2.address)).to.be.revertedWith(
          "Pausable: not paused"
        );
      });
      it("drains all the tokens from the pool to given address", async () => {
        const { pool, signers, usdc } = await loadFixture(deploy365days);
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
    it("should calculate the adjusted lender APR", async () => {
      const { pool } = await loadFixture(deploy73days);
      const adjustedLenderAPR = await pool.lenderAdjustedAPR();
      expect(adjustedLenderAPR).to.be.equal(parseUnits("0.02", WAD_PRECISION));
    });

    it("should calculate expected lender yield", async () => {
      const { pool } = await loadFixture(deploy73days);
      expect(await pool.expectedAllLendersYield()).to.be.equal(
        parseUnits("200", USDC_PRECISION)
      );
    });

    it("should calculate the adjusted borrower APR", async () => {
      const { pool } = await loadFixture(deploy73days);
      expect(await pool.borrowerAdjustedAPR()).to.be.equal(
        parseUnits("0.04", WAD_PRECISION)
      );
    });

    it("should calculate expected borrower interest", async () => {
      const { pool } = await loadFixture(deploy73days);
      expect(await pool.borrowerExpectedInterest()).to.be.equal(
        parseUnits("400", USDC_PRECISION)
      );
    });
  });
});
