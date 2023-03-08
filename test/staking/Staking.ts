import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployStaking, deployTribalToken } from "../../lib/pool_deployments";
import { deployAuthority } from "../../lib/pool_deployments";
import testSetup, { USDC_ADDRESS_6 } from "../helpers/usdc";
import { USDC } from "../helpers/conversion";

describe("PoolFactory", function () {
  async function fixture() {
    const { signers, usdc } = await testSetup();
    const [deployer, lender1, lender2, lender3, borrower] = signers;
    const lenders = [lender1, lender2, lender3];
    const tribalToken = await deployTribalToken(deployer, lenders);
    const authority = await deployAuthority(deployer, borrower, lenders);
    const staking = await deployStaking(
      authority.address,
      tribalToken.address,
      usdc.address,
      60
    );

    return {
      deployer,
      lender1,
      lender2,
      lender3,
      borrower,
      tribalToken,
      usdc,
      staking,
    };
  }

  describe("big integrational test", async function () {
    it("behaves as described in https://github.com/Aboudoc/Discrete-Staking-Rewards/tree/main/images", async function () {
      const {
        lender1: alice,
        lender2: bob,
        deployer,
        tribalToken,
        usdc,
        staking,
      } = await loadFixture(fixture);

      // at t0. Alice stakes 2000 TRIBAL
      const aliceStake = ethers.utils.parseEther("2000");
      await tribalToken.connect(alice).approve(staking.address, aliceStake);
      await staking.connect(alice).stake(aliceStake);
      expect(await staking.stakedBalanceOf(alice.address)).to.equal(aliceStake);

      // at t1. Deployer adds 100 USDC reward to the pool
      const t1Reward = USDC(100);
      await usdc.connect(deployer).approve(staking.address, t1Reward);
      await staking.connect(deployer).addReward(t1Reward);
      // at t1. Alice reward is 100 USDC
      expect(await staking.calculateRewardsEarned(alice.address)).to.equal(
        USDC(100)
      );

      // at t2. Deployer adds 200 USDC more reward to the pool
      const t2Reward = USDC(200);
      await usdc.connect(deployer).approve(staking.address, t2Reward);
      await staking.connect(deployer).addReward(t2Reward);
      // at t2. Alice reward is 300 USDC
      expect(await staking.calculateRewardsEarned(alice.address)).to.equal(
        USDC(300)
      );

      // at t3. Bob stakes 1000 TRIBAL
      const bobStake = ethers.utils.parseEther("1000");
      await tribalToken.connect(bob).approve(staking.address, bobStake);
      await staking.connect(bob).stake(bobStake);
      expect(await staking.stakedBalanceOf(bob.address)).to.equal(bobStake);
      // at t3. Alice reward is 300 USDC
      expect(await staking.calculateRewardsEarned(alice.address)).to.equal(
        USDC(300)
      );
      // at t3. Bob reward is 0 USDC
      expect(await staking.calculateRewardsEarned(bob.address)).to.equal(
        USDC(0)
      );

      // at t4. Deployer adds 300 USDC more reward to the pool
      const t4Reward = USDC(300);
      await usdc.connect(deployer).approve(staking.address, t4Reward);
      await staking.connect(deployer).addReward(t4Reward);
      // at t4. Alice reward is 500 USDC
      expect(await staking.calculateRewardsEarned(alice.address)).to.equal(
        USDC(500)
      );
      // at t4. Bob reward is 100 USDC
      expect(await staking.calculateRewardsEarned(bob.address)).to.equal(
        USDC(100)
      );

      // at t5. Alice claims reward and creates unstake request
      const aliceUsdcBalanceBefore = await usdc.balanceOf(alice.address);
      await staking.connect(alice).claimReward();
      const aliceUsdcBalanceAfter = await usdc.balanceOf(alice.address);
      expect(aliceUsdcBalanceAfter.sub(aliceUsdcBalanceBefore)).to.equal(
        USDC(500)
      );
      expect(await staking.calculateRewardsEarned(alice.address)).to.equal(0);
      await staking.connect(alice).requestUnstake(aliceStake);
      // and wait for cooldown period to pass
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);

      // at t6. Alice withdraws her stake
      const aliceTribeBalanceBefore = await tribalToken.balanceOf(
        alice.address
      );
      await staking.connect(alice).unstake();
      const aliceTribeBalanceAfter = await tribalToken.balanceOf(alice.address);
      expect(aliceTribeBalanceAfter.sub(aliceTribeBalanceBefore)).to.equal(
        aliceStake
      );
      expect(await staking.calculateRewardsEarned(alice.address)).to.equal(0);

      // at t7. Deployer adds 200 USDC more reward to the pool
      const t7Reward = USDC(200);
      await usdc.connect(deployer).approve(staking.address, t7Reward);
      await staking.connect(deployer).addReward(t7Reward);
      // at t7. Bob reward is 300 USDC
      expect(await staking.calculateRewardsEarned(bob.address)).to.equal(
        USDC(300)
      );

      // at t8. Bob claims reward and creates unstake request
      const bobUsdcBalanceBefore = await usdc.balanceOf(bob.address);
      await staking.connect(bob).claimReward();
      const bobUsdcBalanceAfter = await usdc.balanceOf(bob.address);
      expect(bobUsdcBalanceAfter.sub(bobUsdcBalanceBefore)).to.equal(USDC(300));
      expect(await staking.calculateRewardsEarned(bob.address)).to.equal(0);
      await staking.connect(bob).requestUnstake(bobStake);
      // and wait for cooldown period to pass
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);

      // at t9. Bob withdraws his stake
      const bobTribeBalanceBefore = await tribalToken.balanceOf(bob.address);
      await staking.connect(bob).unstake();
      const bobTribeBalanceAfter = await tribalToken.balanceOf(bob.address);
      expect(bobTribeBalanceAfter.sub(bobTribeBalanceBefore)).to.equal(
        bobStake
      );
      expect(await staking.calculateRewardsEarned(bob.address)).to.equal(0);
    });
  });

  describe("stake", function () {
    it("should allow a user to stake tokens", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      const stakedBalance = await staking.stakedBalanceOf(lender1.address);
      expect(stakedBalance).to.equal(amount);
    });
  });

  describe("requestUnstake", function () {
    it("should allow a user to request unstake tokens", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      const unstakeRequest = await staking.unstakeRequests(lender1.address);
      expect(unstakeRequest.amount).to.equal(amount);
      expect(unstakeRequest.timestamp).to.not.equal(0);
    });

    it("should allow a user to request unstake tokens twice", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      await expect(
        staking.connect(lender1).requestUnstake(amount)
      ).to.be.revertedWith("Unstake request already exists");
    });

    it("should not allow a user to request unstake more tokens than their staked balance", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      await expect(
        staking.connect(lender1).requestUnstake(amount.add(1))
      ).to.be.revertedWith("Insufficient staked balance");
    });
  });

  describe("unstaking", function () {
    it("should allow a user to unstake tokens after unstake request and cooldown period", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      // wait for cooldown period to pass
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await tribalToken.balanceOf(lender1.address);

      await staking.connect(lender1).unstake();

      const balanceAfter = await tribalToken.balanceOf(lender1.address);
      expect(balanceAfter.sub(balanceBefore)).to.equal(amount);

      const stakedBalance = await staking.stakedBalanceOf(lender1.address);
      expect(stakedBalance).to.equal(0);
    });

    it("should not allow a user to unstake tokens when there is no unstake request", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      await expect(staking.connect(lender1).unstake()).to.be.revertedWith(
        "No unstake request"
      );
    });

    it("should not allow a user to unstake tokens before cooldown period", async function () {
      const { lender1, tribalToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await tribalToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      await expect(staking.connect(lender1).unstake()).to.be.revertedWith(
        "Cooldown period not passed"
      );
    });
  });
});
