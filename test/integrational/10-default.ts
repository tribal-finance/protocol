import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { PoolFactory } from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
} from "../../lib/pool_deployments";
import testSetup from "../helpers/usdc";
import STAGES from "../helpers/stages";

describe("Defaulting", function () {
  context("unitranche pool without payments",function () {
      
      // Lending Pool Test Fixture
      async function uniPoolFixture() {
        const { signers, usdc } = await testSetup();
        const [deployer, lender1, lender2, lender3, borrower, foundation] =
          signers;
        const lenders = [lender1, lender2, lender3];

        const poolFactory: PoolFactory = await deployFactoryAndImplementations(
          deployer,
          borrower,
          lenders,
          foundation.address
        );

        const feeSharingAddress = await poolFactory.feeSharingContractAddress();
        const feeSharing = await ethers.getContractAt(
          "FeeSharing",
          feeSharingAddress
        );

        const stakingAddress = await feeSharing.stakingContract();
        const staking = await ethers.getContractAt("Staking", stakingAddress);

        const platformTokenAddress = await staking.stakingToken();
        const platformToken = await ethers.getContractAt(
          "PlatformToken",
          platformTokenAddress
        );

        const afterDeploy = async (contracts: DeployedContractsType) => {
          await usdc
            .connect(borrower)
            .approve(
              contracts.lendingPool.address,
              await contracts.lendingPool.firstLossAssets()
            );

          await contracts.lendingPool
            .connect(borrower)
            .borrowerDepositFirstLossCapital();
          await contracts.lendingPool.connect(deployer).adminOpenPool();

          let toDeposit = await USDC(4000);
          await usdc
            .connect(lender1)
            .approve(contracts.firstTrancheVault.address, toDeposit);

          await contracts.firstTrancheVault
            .connect(lender1)
            .deposit(toDeposit, await lender1.getAddress());

          toDeposit = await USDC(6000);
          await usdc
            .connect(lender2)
            .approve(contracts.firstTrancheVault.address, toDeposit);

          await contracts.firstTrancheVault
            .connect(lender2)
            .deposit(toDeposit, await lender2.getAddress());
          
          // transition to funded state
          await contracts.lendingPool
            .connect(deployer)
            .adminTransitionToFundedState();

          // borrower borrows funds
          await contracts.lendingPool.connect(borrower).borrow();

          // wait for the lending term to pass by
          const toWait = await contracts.lendingPool
            .connect(deployer)
            .lendingTermSeconds();
          await ethers.provider.send("evm_increaseTime", [toWait.toNumber()]);
          await ethers.provider.send("evm_mine", []);

          await contracts.lendingPool
            .connect(deployer)
            .adminTransitionToDefaultedState();

          return contracts;
        };

        const data = await deployUnitranchePool(
          poolFactory,
          deployer,
          borrower,
          lenders,
          {},
          afterDeploy
        );

        return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
      }

      it("sets the pool to defaulted stage", async function () {
        const { lendingPool } = await loadFixture(uniPoolFixture);

        expect(await lendingPool.currentStage()).to.eq(STAGES.DEFAULTED);
      });

      it("sets default ratio on the first tranche to 0.2 (2000/10000)", async function () {
        const { firstTrancheVault } = await loadFixture(uniPoolFixture);

        expect(await firstTrancheVault.defaultRatioWad()).to.eq(WAD(0.2));
      });

      it("sets maxWithdraw for first lender to 800 (4000 * 0.2)", async function () {
        const { firstTrancheVault, lenders } = await loadFixture(
          uniPoolFixture
        );

        expect(
          await firstTrancheVault.maxWithdraw(lenders[0].getAddress())
        ).to.eq(USDC(800));
      });

      it("allows first lender to withdraw 800", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender1Address = await lenders[0].getAddress();
        const balanceBefore = await usdc.balanceOf(lender1Address);

        await firstTrancheVault
          .connect(lenders[0])
          .withdraw(USDC(800), lender1Address, lender1Address);

        const balanceAfter = await usdc.balanceOf(lender1Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(800));
      });

      it("allows first lender to redeem 4000 tranche tokens for 800 USDC", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender1Address = await lenders[0].getAddress();
        const balanceBefore = await usdc.balanceOf(lender1Address);

        await firstTrancheVault
          .connect(lenders[0])
          .redeem(USDC(4000), lender1Address, lender1Address);

        const balanceAfter = await usdc.balanceOf(lender1Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(800));
      });

      it("sets maxWithdraw for second lender to 1200 (6000 * 0.2)", async function () {
        const { firstTrancheVault, lenders } = await loadFixture(
          uniPoolFixture
        );

        expect(
          await firstTrancheVault.maxWithdraw(lenders[1].getAddress())
        ).to.eq(USDC(1200));
      });

      it("allows second lender to withdraw 1200 once", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender2Address = await lenders[1].getAddress();
        const balanceBefore = await usdc.balanceOf(lender2Address);

        await firstTrancheVault
          .connect(lenders[1])
          .withdraw(USDC(1200), lender2Address, lender2Address);

        const balanceAfter = await usdc.balanceOf(lender2Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(1200));

        // second withdrawal should fail
        await expect(
          firstTrancheVault
            .connect(lenders[1])
            .withdraw(USDC(1200), lender2Address, lender2Address)
        ).to.be.revertedWith("ERC4626: withdraw more than max");
          
        const lastBalance = await usdc.balanceOf(lender2Address);
        expect(lastBalance).to.eq(balanceAfter);

      });

      it('does not allow second lender to withdraw twice', async function () {}); 


      it("allows second lender to redeem 6000 tranche tokens for 1200 USDC", async function () {
        const { firstTrancheVault, lenders, usdc } = await loadFixture(
          uniPoolFixture
        );

        const lender2Address = await lenders[1].getAddress();
        const balanceBefore = await usdc.balanceOf(lender2Address);

        await firstTrancheVault
          .connect(lenders[1])
          .redeem(USDC(6000), lender2Address, lender2Address);

        const balanceAfter = await usdc.balanceOf(lender2Address);
        expect(balanceAfter.sub(balanceBefore)).to.eq(USDC(1200));
      });
    }
  );

  context("unitranche pool with payments", function () {
    const poolFixture = async () => {
     const { signers, usdc } = await testSetup();
        const [deployer, lender1, lender2, lender3, borrower, foundation] =
          signers;
        const lenders = [lender1, lender2, lender3];

        const poolFactory: PoolFactory = await deployFactoryAndImplementations(
          deployer,
          borrower,
          lenders,
          foundation.address
        );

        const feeSharingAddress = await poolFactory.feeSharingContractAddress();
        const feeSharing = await ethers.getContractAt(
          "FeeSharing",
          feeSharingAddress
        );

        const stakingAddress = await feeSharing.stakingContract();
        const staking = await ethers.getContractAt("Staking", stakingAddress);

        const platformTokenAddress = await staking.stakingToken();
        const platformToken = await ethers.getContractAt(
          "PlatformToken",
          platformTokenAddress
        );
          
        const afterDeploy = async (contracts: DeployedContractsType) => {
          // deposit first loss capital
          await usdc
            .connect(borrower)
            .approve(
              contracts.lendingPool.address,
              await contracts.lendingPool.firstLossAssets()
            );
          await contracts.lendingPool
            .connect(borrower)
            .borrowerDepositFirstLossCapital();

          // admin opens pool
          await contracts.lendingPool.connect(deployer).adminOpenPool();

          let toDeposit = USDC(5000);
          await usdc
            .connect(lender1)
            .approve(contracts.firstTrancheVault.address, toDeposit);

          await contracts.firstTrancheVault
            .connect(lender1)
            .deposit(toDeposit, await lender1.getAddress());

          toDeposit = await USDC(5000);
          await usdc
            .connect(lender2)
            .approve(contracts.firstTrancheVault.address, toDeposit);

          await contracts.firstTrancheVault
            .connect(lender2)
            .deposit(toDeposit, await lender2.getAddress());
          
          // transition to funded state
          await contracts.lendingPool
            .connect(deployer)
            .adminTransitionToFundedState();

          // borrower borrows funds
          await contracts.lendingPool.connect(borrower).borrow();

          return contracts;
        };

        const data = await deployUnitranchePool(
          poolFactory,
          deployer,
          borrower,
          lenders,
          {},
          afterDeploy
        );

        return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
      }

      it("allows lenders to claim funds prior to default", async function () {
        const {  lendingPool, firstTrancheVault, deployer, lenders: [lender1, lender2], borrower, usdc } = await loadFixture(poolFixture);

          // wait for the lending term to pass by
          const toWait = await lendingPool
            .connect(deployer)
            .lendingTermSeconds();
          const timeBlock = toWait.div(3).toNumber();
          
          // wait first time block
          await ethers.provider.send("evm_increaseTime", [timeBlock]);
          // mine a block to offset the claiming block
          await ethers.provider.send("evm_mine", []);
          // calculate interest payment
          const interestPayment = await lendingPool
            .connect(deployer)
            .borrowerOutstandingInterest();

          // make first payment
          await usdc
            .connect(borrower)
            .approve(lendingPool.address, interestPayment);
          
          await lendingPool.connect(borrower).borrowerPayInterest(interestPayment);

          // lenders claim interest part 1
          const tranche1ID = await firstTrancheVault.id();

          // get amount lender can claim for tranche 1
          const lender1Claimable1 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender1.getAddress(), tranche1ID);
          const lender2Claimable1 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender2.getAddress(), tranche1ID);

          await lendingPool.connect(lender1).lenderRedeemRewardsByTranche(tranche1ID, lender1Claimable1 );
          await lendingPool.connect(lender2).lenderRedeemRewardsByTranche(tranche1ID, lender2Claimable1 );

          // wait second time block
          await ethers.provider.send("evm_increaseTime", [timeBlock]);
          await ethers.provider.send("evm_mine", []);


          // borrower makes second payment double the size 
          await usdc
            .connect(borrower)
            .approve(lendingPool.address, interestPayment.mul(3));
          
          await lendingPool.connect(borrower).borrowerPayInterest(interestPayment.mul(3));

          // lenders claim interest part 2
          const lender1Claimable2 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender1.getAddress(), tranche1ID);
          const lender2Claimable2 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender2.getAddress(), tranche1ID);
          it("funds are not ready for lenders to claim", function () {
          // amounts claimable should be the same as before since time based
          expect(lender1Claimable2).to.be.approximately(lender1Claimable1, 40);
          expect(lender2Claimable2).to.be.approximately(lender2Claimable1, 40);
          })

          // check lender usdc balances
          const lender1Balance = await usdc.balanceOf(await lender1.getAddress());
          const lender2Balance = await usdc.balanceOf(await lender2.getAddress());


          await lendingPool.connect(lender1).lenderRedeemRewardsByTranche(tranche1ID, lender1Claimable2 );
          await lendingPool.connect(lender2).lenderRedeemRewardsByTranche(tranche1ID, lender2Claimable2 );


          // check lender usdc balances increased by the claimable amount
          expect(await usdc.balanceOf(await lender1.getAddress())).to.eq(lender1Balance.add(lender1Claimable2));
          expect(await usdc.balanceOf(await lender2.getAddress())).to.eq(lender2Balance.add(lender2Claimable2));

          // wait third time block
          await ethers.provider.send("evm_increaseTime", [timeBlock]);
          await ethers.provider.send("evm_mine", []);

          const lender1Balance2 = await usdc.balanceOf(await lender1.getAddress());
          // lenders claim interest part 3
          const lender1Claimable3 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender1.getAddress(), tranche1ID);
          const lender2Claimable3 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender2.getAddress(), tranche1ID);
          // only lender1 claims
          await lendingPool.connect(lender1).lenderRedeemRewardsByTranche(tranche1ID, lender1Claimable3);

          // lender 1 and lender 2 should have the same claimable amount
          expect(lender1Claimable3).to.eq(lender2Claimable3); 

          expect(await usdc.balanceOf(await lender1.getAddress())).to.eq(lender1Balance2.add(lender1Claimable3));
          // await lendingPool.connect(lender2).lenderRedeemRewardsByTranche(tranche1ID, lender2Claimable3 );
          const lender1Claimable4 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender1.getAddress(), tranche1ID);
          const lender2Claimable4 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender2.getAddress(), tranche1ID);

          // lender 1 claims again
          await lendingPool.connect(lender1).lenderRedeemRewardsByTranche(tranche1ID, lender1Claimable4);

          // lender 1 should have 0 claimable
          expect(lender1Claimable4).to.eq(0);
          expect(lender2Claimable3).to.eq(lender2Claimable4);


          // borrower doesn't repay and defaults
          await lendingPool
            .connect(deployer)
            .adminTransitionToDefaultedState();

          // expect to be in defaulted state
          expect(await lendingPool.currentStage()).to.eq(STAGES.DEFAULTED);
          
          // lender 2 claim part 3 should be available after default established
          const lender1Claimable5 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender1.getAddress(), tranche1ID);
          const lender2Claimable5 = await lendingPool.lenderRewardsByTrancheRedeemable( await lender2.getAddress(), tranche1ID);

          expect(lender2Claimable5).to.eq(lender2Claimable4);
          expect(lender1Claimable4).to.eq(0);


          // lender 2 claims
          // TODO: Lender 2 is unable to claim earned interest after move to default state. Currently returns a LP004 error
          // await lendingPool.connect(lender2).lenderRedeemRewardsByTranche(tranche1ID, lender2Claimable5 );

          // verify defaultRatio is ~0.45
          const defaultRatio = await firstTrancheVault.defaultRatioWad();
          expect(defaultRatio, 'Verify Default Ratio').to.approximately(WAD(0.45), WAD(0.0005));
          const lender1LastBalance = await usdc.balanceOf(await lender1.getAddress());

          const maxWithdraw1 = await firstTrancheVault.maxWithdraw(await lender1.getAddress());
          const maxWithdraw2 = await firstTrancheVault.maxWithdraw(await lender2.getAddress());
          // verify maxWithdraw for lender 1 is 1000 (5000 * 0.2)
          expect(maxWithdraw1).to.approximately(USDC(2250), USDC(5));

          // verify maxWithdraw for lender 2 is 1000 (5000 * 0.2)
          expect(maxWithdraw2).to.approximately(USDC(2250), USDC(5));


          // lenders claim principal

          // lender 1 claims max withdraw
          await firstTrancheVault
            .connect(lender1)
            .withdraw(maxWithdraw1, lender1.getAddress(), lender1.getAddress());

          // lender 2 claims max withdraw
          await firstTrancheVault
            .connect(lender2)
            .withdraw(maxWithdraw2, await lender2.getAddress(), await lender2.getAddress());


          // verify lender 1 balance is increased by max withdraw
          expect(await usdc.balanceOf(await lender1.getAddress()), "Lender balance increased by maxWithdraw").to.eq(lender1LastBalance.add(maxWithdraw1));


      });
  


  });  

  context("two tranche pool", function () {
    async function duoPoolFixture() {
      const { signers, usdc } = await testSetup();
      const [deployer, lender1, lender2, lender3, borrower, foundation] =
        signers;
      const lenders = [lender1, lender2, lender3];

      const poolFactory: PoolFactory = await deployFactoryAndImplementations(
        deployer,
        borrower,
        lenders,
        foundation.address
      );

      const afterDeploy = async (contracts: DeployedContractsType) => {
        // approve usdc for lending pool first loss capital
        await usdc
          .connect(borrower)
          .approve(
            contracts.lendingPool.address,
            await contracts.lendingPool.firstLossAssets()
          );
        // deposit first loss capital
        await contracts.lendingPool
          .connect(borrower)
          .borrowerDepositFirstLossCapital();
        // Open pool
        await contracts.lendingPool.connect(deployer).adminOpenPool();

        // Deposit usdc for first tranche vault
        await usdc
          .connect(lender1)
          .approve(contracts.firstTrancheVault.address, USDC(8000));
        await contracts.firstTrancheVault
          .connect(lender1)
          .deposit(USDC(4000), lender1.address);
        
        // Deposit usdc for second tranche vault
        await usdc
          .connect(lender2)
          .approve(secondTrancheVault.address, USDC(2000));
        await secondTrancheVault
          .connect(lender2)
          .deposit(USDC(2000), lender2.address);
        
        // Set pool to funded state
        await contracts.lendingPool
          .connect(deployer)
          .adminTransitionToFundedState();

        return contracts;
      };

      const data = await deployDuotranchePool(
        poolFactory,
        deployer,
        borrower,
        lenders,
        {},
        afterDeploy
      );

      return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
    }

    
  });
});
