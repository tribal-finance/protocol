import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployStaking, deployPlatformToken } from "../../lib/pool_deployments";
import { deployAuthority } from "../../lib/pool_deployments";
import testSetup, { USDC_ADDRESS_6 } from "../helpers/usdc";
import { USDC } from "../helpers/conversion";

describe("Staking", function () {
  async function fixture() {
    const { signers, usdc } = await testSetup();
    const [deployer, lender1, lender2, lender3, borrower] = signers;
    const lenders = [lender1, lender2, lender3];
    const platformToken = await deployPlatformToken(deployer, lenders);
    const authority = await deployAuthority(deployer, borrower, lenders);
    const staking = await deployStaking(
      authority.address,
      platformToken.address,
      usdc.address,
      60
    );

    return {
      deployer,
      lender1,
      lender2,
      lender3,
      borrower,
      platformToken,
      usdc,
      staking,
    };
  }

  describe("Staking Lifecycle", async function () {
    it("behaves as described in https://github.com/Aboudoc/Discrete-Staking-Rewards/tree/main/images", async function () {
      const {
        lender1: alice,
        lender2: bob,
        deployer,
        platformToken,
        usdc,
        staking,
      } = await loadFixture(fixture);

      // at t0. Alice stakes 2000 PLATFORM
      const aliceStake = ethers.utils.parseEther("2000");
      await platformToken.connect(alice).approve(staking.address, aliceStake);
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

      // at t3. Bob stakes 1000 PLATFORM
      const bobStake = ethers.utils.parseEther("1000");
      await platformToken.connect(bob).approve(staking.address, bobStake);
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
      const aliceTribeBalanceBefore = await platformToken.balanceOf(
        alice.address
      );
      await staking.connect(alice).unstake();
      const aliceTribeBalanceAfter = await platformToken.balanceOf(alice.address);
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
      const bobTribeBalanceBefore = await platformToken.balanceOf(bob.address);
      await staking.connect(bob).unstake();
      const bobTribeBalanceAfter = await platformToken.balanceOf(bob.address);
      expect(bobTribeBalanceAfter.sub(bobTribeBalanceBefore)).to.equal(
        bobStake
      );
      expect(await staking.calculateRewardsEarned(bob.address)).to.equal(0);
    });
  });

  describe("stake", function () {
    it("should allow a user to stake tokens", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      const stakedBalance = await staking.stakedBalanceOf(lender1.address);
      expect(stakedBalance).to.equal(amount);
    });
  });

  describe("requestUnstake", function () {
    it("should allow a user to request unstake tokens", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      const unstakeRequest = await staking.unstakeRequests(lender1.address);
      expect(unstakeRequest.amount).to.equal(amount);
      expect(unstakeRequest.timestamp).to.not.equal(0);
    });

    it("should not allow a user to request unstake tokens twice", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount.div(2));

      await expect(
        staking.connect(lender1).requestUnstake(amount.div(2))
      ).to.be.revertedWith("Unstake request already exists");
    });

    it("should not allow a user to request unstake more tokens than their staked balance", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      await expect(
        staking.connect(lender1).requestUnstake(amount.add(1))
      ).to.be.revertedWith("Insufficient staked balance");
    });
  });

  describe('claimReward', function () {
    it('should allow a user to claim rewards', async function () {
      const { lender1, platformToken, staking, usdc, deployer  } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther('100');

      // stake tokens
      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      // add rewards
      await usdc.connect(deployer).approve(staking.address, USDC(100));
      await staking.connect(deployer).addReward(USDC(100));

      // claim rewards
      const balanceBefore = await usdc.balanceOf(lender1.address);
      await staking.connect(lender1).claimReward();
      const balanceAfter = await usdc.balanceOf(lender1.address);

      // check that rewards were claimed
      expect(balanceAfter.sub(balanceBefore)).to.equal(USDC(100));
    });

    it('should not allow a user to claim rewards twice', async function () {
      const { lender1, platformToken, staking, deployer, usdc } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther('100');

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      const initialBalance = await usdc.balanceOf(lender1.address);

      // add rewards
       // add rewards
      await usdc.connect(deployer).approve(staking.address, USDC(100));
      await staking.connect(deployer).addReward(USDC(100));

      // claim rewards and verify
      const newBalance = initialBalance.add(USDC(100));
      await staking.connect(lender1).claimReward();
      expect(await usdc.balanceOf(lender1.address)).to.equal(newBalance);
      // try to claim rewards again
      const claim2 = await staking.connect(lender1).claimReward();
      expect(await usdc.balanceOf(lender1.address)).to.equal(newBalance);
    });

    it('should not allow a user to claim rewards after they have requestedUnstake', async function () {
      const { lender1, lender2, platformToken, staking, deployer, usdc } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther('100');

      const initialBalance1 = await usdc.balanceOf(lender1.address);
      const initialBalance2 = await usdc.balanceOf(lender2.address);

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      await platformToken.connect(lender2).approve(staking.address, amount);
      await staking.connect(lender2).stake(amount);

      // addRewards
      await usdc.connect(deployer).approve(staking.address, USDC(100));
      await staking.connect(deployer).addReward(USDC(100));

      // try to claim rewards for lender 1
      await staking.connect(lender1).claimReward()
      // try to claim rewards for lender 2
      await staking.connect(lender2).claimReward();

      // check that lender 1 did not receive rewards
      expect(await usdc.balanceOf(lender1.address)).to.equal(initialBalance1);

      // check that lender 2 received rewardss
      expect(await usdc.balanceOf(lender2.address)).to.equal(initialBalance2.add(USDC(100)));

    });


    it('should not allow a user to claim rewards if they have not staked', async function () {
      const { lender1, lender2, staking, usdc, deployer, platformToken } = await loadFixture(fixture);
      const initialBalance1 = await usdc.balanceOf(lender1.address);
      const initialBalance2 = await usdc.balanceOf(lender2.address);
      const amount = ethers.utils.parseEther('100');

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      // try to claim rewards and verify return 0
      await staking.connect(lender2).claimReward();

      // check that lender 2 did not receive rewards
      expect(await usdc.balanceOf(lender2.address)).to.equal(initialBalance2);  
    });
  });

  


  describe("unstaking", function () {
    it("should allow a user to unstake tokens after unstake request and cooldown period", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      // wait for cooldown period to pass
      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await platformToken.balanceOf(lender1.address);

      await staking.connect(lender1).unstake();

      const balanceAfter = await platformToken.balanceOf(lender1.address);
      expect(balanceAfter.sub(balanceBefore)).to.equal(amount);

      const stakedBalance = await staking.stakedBalanceOf(lender1.address);
      expect(stakedBalance).to.equal(0);
    });

    it("should not allow a user to unstake tokens when there is no unstake request", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");
      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await expect(staking.connect(lender1).unstake()).to.be.revertedWith(
        "No unstake request"
      );
    });

    it("should not allow a user to unstake tokens before cooldown period", async function () {
      const { lender1, platformToken, staking } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther("100");

      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);
      await staking.connect(lender1).requestUnstake(amount);

      await expect(staking.connect(lender1).unstake()).to.be.revertedWith(
        "Cooldown period not passed"
      );
    });

    it('should not allow a user to get rewards during unstake cooldown period', async function () {
      const { lender1, lender2, lender3, platformToken, staking, deployer, usdc } = await loadFixture(fixture);
      const amount = ethers.utils.parseEther('100');
      const lender1InitialBalance = await usdc.balanceOf(lender1.address);
      const lender2InitialBalance = await usdc.balanceOf(lender2.address);
      const lender3InitialBalance = await usdc.balanceOf(lender3.address);

      // lender 1 stake
      await platformToken.connect(lender1).approve(staking.address, amount);
      await staking.connect(lender1).stake(amount);

      // lender 2 stake
      await platformToken.connect(lender2).approve(staking.address, amount);
      await staking.connect(lender2).stake(amount);

      // lender 3 stake
      await platformToken.connect(lender3).approve(staking.address, amount);
      await staking.connect(lender3).stake(amount);

      // lender 1 request unstake
      await staking.connect(lender1).requestUnstake(amount);

      // add rewards
      await usdc.connect(deployer).approve(staking.address, USDC(100));
      await staking.connect(deployer).addReward(USDC(100));

      // lender 1 try to claim rewards and verify return 0
      await staking.connect(lender1).claimReward();

      // check that lender 1 did not receive rewards
      expect(await usdc.balanceOf(lender1.address)).to.equal(lender1InitialBalance);

      // lender 2 try to claim rewards and verify return 50
      await staking.connect(lender2).claimReward();

      // check that lender 2 received rewards
      expect(await usdc.balanceOf(lender2.address)).to.equal(lender2InitialBalance.add(USDC(50)));

      // lender 3 try to claim rewards and verify return 50
      await staking.connect(lender3).claimReward();

      // check that lender 3 received rewards
      expect(await usdc.balanceOf(lender3.address)).to.equal(lender3InitialBalance.add(USDC(50)));
      
    });
  });
}); 

