import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../../helpers/usdc";
import { DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT } from "../../../lib/pool_deployments";

import {
  ITestUSDC,
  LendingPool,
  PoolFactory,
  TrancheVault,
  PlatformToken,
  Authority,
} from "../../../typechain-types";
import { USDC, WAD } from "../../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
  deployPlatformToken,
} from "../../../lib/pool_deployments";
import testSetup from "../../helpers/usdc";
import STAGES from "../../helpers/stages";

describe("Rollovers (2 Lender / 2 Tranche)", function () {
  context("For unitranche pool", async function () {
    async function duoPoolFixture() {
      const { signers, usdc } = await testSetup();

      const [deployer, lender1, lender2, lender3, borrower, foundation] =
        signers;
      const lenders = [lender1, lender2, lender3];

      const platformToken = await deployPlatformToken(
        deployer,
        lenders,
        foundation.address
      );

      const poolFactory: PoolFactory = await deployFactoryAndImplementations(
        deployer,
        borrower,
        lenders,
        foundation.address
      );
      const afterDeploy = async (contracts: DeployedContractsType) => {
        return contracts;
      };

      const data = await deployDuotranchePool(
        poolFactory,
        deployer,
        borrower,
        lenders,
        {
          platformTokenContractAddress: platformToken.address,
        },
        afterDeploy
      );

      return {
        ...data,
        usdc,
        ...(await _getDeployedContracts(poolFactory)),
        platformToken,
      }
    }

    let usdc: ITestUSDC,
      platformToken: PlatformToken,
      lendingPool: LendingPool,
      firstTrancheVault: TrancheVault,
      secondTrancheVault: TrancheVault,
      authority: Authority,
      poolFactory: PoolFactory,
      deployer: Signer,
      borrower: Signer,
      lender1: Signer,
      lender2: Signer,
      lendingPoolParams: any;

    before(async () => {
      const data = await loadFixture(duoPoolFixture);
      usdc = data.usdc;
      platformToken = data.platformToken;
      lendingPool = data.lendingPool;
      firstTrancheVault = data.firstTrancheVault;
      secondTrancheVault = data.secondTrancheVault as TrancheVault;
      if (!secondTrancheVault) {
        throw new Error("Bad second tranche vault");
      }
      poolFactory = data.poolFactory;
      deployer = data.deployer;
      borrower = data.borrower;
      lender1 = data.lenders[0];
      lender2 = data.lenders[1];
      authority = data.authority;
      lendingPoolParams = data.lendingPoolParams;
    });

    it("is initially in INITIAL stage and requires a deposit of 2000 USDC", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.INITIAL);
      expect(await lendingPool.firstLossAssets()).to.equal(USDC(2000));
    });

    it("🏛️ 2000 USDC flc deposit from the borrower", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(2000));
      await lendingPool.connect(borrower).borrowerDepositFirstLossCapital();
    });

    it("transitions to the FLC_DEPOSITED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_DEPOSITED);
    });

    it("👮 receives adminOpenPool() from deployer", async () => {
      await lendingPool.connect(deployer).adminOpenPool();
    });

    it("transitions to OPEN stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.OPEN);
    });


    it("8000 USDC deposit from lender 1 & 2", async () => {
      await usdc
        .connect(lender1)
        .approve(firstTrancheVault.address, USDC(8000));

      await firstTrancheVault
        .connect(lender1)
        .deposit(USDC(8000), await lender1.getAddress());
    });

    it("gives 8000 tranche vault tokens to lender 1", async () => {
      expect(
        await firstTrancheVault.balanceOf(await lender1.getAddress())
      ).to.equal(USDC(8000));

    });

    it("increases collectedAssets() to 8000", async () => {
      expect(await lendingPool.collectedAssets()).to.equal(USDC(8000));
    });

    it("sets lenderTotalExpectedRewardsByTranche for lender1 to 400 (8000* 1/2 year * 10%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender1.getAddress(),
          0
        )
      ).to.equal(USDC(400));
    });

    it("2000 USDC deposit from lender 2", async () => {
      await usdc
        .connect(lender2)
        .approve(secondTrancheVault.address, USDC(2000));

      await secondTrancheVault
        .connect(lender2)
        .deposit(USDC(2000), await lender2.getAddress());
    });

    it("In an ostentatious display of financial acumen, the lender manifests a predilection for the activation of rollovers", async () => {
      await lendingPool.connect(lender1).lenderEnableRollOver(true, true, true);
      await lendingPool.connect(lender2).lenderEnableRollOver(true, true, true);
    })

    it("sets lenderTotalExpectedRewardsByTranche for lender2 to 120 (2000* 1/2 year * 10%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender2.getAddress(),
          1
        )
      ).to.equal(USDC(120));
    });

    it("sets borrowerExpectedInterest() to 750 USDC", async () => {
      expect(await lendingPool.borrowerExpectedInterest()).to.equal(USDC(750));
    });

    it("increases collectedAssets() to 10000", async () => {
      expect(await lendingPool.collectedAssets()).to.equal(USDC(10000));
    });

    it("10000 PLATFORM tokens locked by lender1", async () => {
      await platformToken
        .connect(lender1)
        .approve(lendingPool.address, WAD(10000));
      await lendingPool
        .connect(lender1)
        .lenderLockPlatformTokensByTranche(0, WAD(10000));
    });

    it("sets lenderTotalExpectedRewardsByTranche for lender1 to 400 (3000 * 1/2 year * 10%) + (5000 * 1/2 year * 15%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender1.getAddress(),
          0
        )
      ).to.equal(USDC(400));
    });

    it("sets allLendersInterest() to 520 USDC", async () => {
      expect(await lendingPool.allLendersInterest()).to.equal(USDC(520));
    });

    it("👮 gets adminTransitionToFundedState() call from deployer", async () => {
      const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
      await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
      await network.provider.send("evm_mine");
      await lendingPool.connect(deployer).adminTransitionToFundedState();
    });

    it("transitions to the FUNDED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FUNDED);
    });

    it("pool contract now holds 12000 USDC", async () => {
      expect(await usdc.balanceOf(lendingPool.address)).to.equal(USDC(12000));
    });

    it("🏛️ borrower withdraws principal and gets 10.000 USDC", async () => {
      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
        USDC(10000)
      );
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $125 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
    });

    it("borrowerOutstandingInterest() is now 0 (borrower already paid 750 USDC)", async () => {
      expect(await lendingPool.borrowerOutstandingInterest()).to.equal(0);
    });

    it("borrowerExcessSpread() is now 155 USDC (750(interest paid) - 625 (lenders interest) - 75(10% protocol fees))", async () => {
      expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(155));
    });

    it("⏳ 3 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    describe("test out rolling over into next pool", async () => {

      let nextLendingPool: LendingPool;
      let nextTrancheVault1: TrancheVault;
      let nextTrancheVault2: TrancheVault;

      it("prepare next generation of protocol to roll into", async () => {
        const futureLenders = await poolFactory.nextLenders();
        const futureTranches = await poolFactory.nextTranches();

        const defaultParams = lendingPoolParams;

        defaultParams.platformTokenContractAddress = await lendingPool.platformTokenContractAddress();
        defaultParams.stableCoinContractAddress = await lendingPool.stableCoinContractAddress();
        defaultParams.maxFundingCapacity = defaultParams.maxFundingCapacity.mul(2);
        defaultParams.firstLossAssets = (await lendingPool.firstLossAssets()).add(USDC(1000));

        const updatedLendingPoolParams = { ...defaultParams, borrowerAddress: await borrower.getAddress() };

        const nextPoolAddr = await poolFactory.callStatic.deployPool(updatedLendingPoolParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT); // view only execution to check lender address
        expect(await poolFactory.prevDeployedTranche(futureTranches[0])).equals(false);
        await poolFactory.deployPool(updatedLendingPoolParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT); // run the state change
        expect(await poolFactory.prevDeployedTranche(futureTranches[0])).equals(true);

        nextLendingPool = await ethers.getContractAt("LendingPool", nextPoolAddr);

        expect(nextPoolAddr).hexEqual(futureLenders[0]);

        const nextTrancheAddr = await nextLendingPool.trancheVaultAddresses(0);

        expect(nextTrancheAddr).hexEqual(futureTranches[0]);

        nextTrancheVault1 = await ethers.getContractAt("TrancheVault", nextTrancheAddr);
        nextTrancheVault2 = await ethers.getContractAt("TrancheVault", await nextLendingPool.trancheVaultAddresses(1));

      })

      it("is initially in INITIAL stage and requires a deposit of 3000 USDC", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.INITIAL);
        expect(await nextLendingPool.firstLossAssets()).to.equal(USDC(3000));
      });

      it("3000 USDC flc deposit from the borrower", async () => {
        //await expect(nextLendingPool.callStatic.adminOrBorrowerRolloverFirstLossCaptial(lendingPool.address)).to.be.reverted;
        // previous flc was 2000 so now borrower needs to approve an additonal 1000 since the new flc is 3000
        await usdc.approve(nextLendingPool.address, 1000000000);
        await nextLendingPool.adminOrBorrowerRolloverFirstLossCaptial(lendingPool.address);
      });

      it("transitions to the FLC_DEPOSITED stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.FLC_DEPOSITED);
      });

      it("receives adminOpenPool() from deployer", async () => {
        const lenderCount = await lendingPool.lenderCount();
        await expect(nextLendingPool.executeRollover(lendingPool.address, [firstTrancheVault.address])).to.be.revertedWith("LP004");
        await nextLendingPool.connect(deployer).adminOpenPool();
      });

      it("transitions to OPEN stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.OPEN);
      });


      it("perform rollover and expect no asset transfers", async () => {
        const asset = await ethers.getContractAt("ERC20", await lendingPool.stableCoinContractAddress());
        const platformToken = await ethers.getContractAt("ERC20", await lendingPool.platformTokenContractAddress());

        const initialBalancesAsset = await Promise.all([
          await asset.balanceOf(lendingPool.address),
          await asset.balanceOf(firstTrancheVault.address),
          await asset.balanceOf(secondTrancheVault.address),
          await asset.balanceOf(nextLendingPool.address),
          await asset.balanceOf(nextTrancheVault1.address),
          await asset.balanceOf(nextTrancheVault2.address)
        ])

        const initialBalancesVault = await Promise.all([
          await firstTrancheVault.balanceOf(await borrower.getAddress()),
          await firstTrancheVault.balanceOf(await lender1.getAddress()),
          await firstTrancheVault.balanceOf(await lender2.getAddress()),
          await secondTrancheVault.balanceOf(await borrower.getAddress()),
          await secondTrancheVault.balanceOf(await lender1.getAddress()),
          await secondTrancheVault.balanceOf(await lender2.getAddress()),
        ])

        const borroweredAssetsInitial = await lendingPool.borrowedAssets();

        const initialBoostedLender1Tranche0Pool1 = await lendingPool.s_trancheRewardables(0, await lender1.getAddress());
        const initialBoostedLender2Tranche0Pool1 = await lendingPool.s_trancheRewardables(0, await lender2.getAddress());
        const initialBoostedLender1Tranche1Pool1 = await lendingPool.s_trancheRewardables(1, await lender1.getAddress());
        const initialBoostedLender2Tranche1Pool1 = await lendingPool.s_trancheRewardables(1, await lender2.getAddress());

        const initialBoostedLender1Tranche0Pool2 = await nextLendingPool.s_trancheRewardables(0, await lender1.getAddress());
        const initialBoostedLender2Tranche0Pool2 = await nextLendingPool.s_trancheRewardables(0, await lender2.getAddress());
        const initialBoostedLender1Tranche1Pool2 = await nextLendingPool.s_trancheRewardables(1, await lender1.getAddress());
        const initialBoostedLender2Tranche1Pool2 = await nextLendingPool.s_trancheRewardables(1, await lender2.getAddress());

        const initialBalanceOfPool1PlatformToken = await platformToken.balanceOf(lendingPool.address);
        const initialBalanceOfPool2PlatformToken = await platformToken.balanceOf(nextLendingPool.address);

        console.log("Boosting state-transfer tests")
        console.log("initials pool 1")
        console.log(initialBoostedLender1Tranche0Pool1.lockedPlatformTokens);
        console.log(initialBoostedLender2Tranche0Pool1.lockedPlatformTokens);
        console.log(initialBoostedLender1Tranche1Pool1.lockedPlatformTokens);
        console.log(initialBoostedLender2Tranche1Pool1.lockedPlatformTokens);
        console.log("initials pool 2")
        console.log(initialBoostedLender1Tranche0Pool2.lockedPlatformTokens);
        console.log(initialBoostedLender2Tranche0Pool2.lockedPlatformTokens);
        console.log(initialBoostedLender1Tranche1Pool2.lockedPlatformTokens);
        console.log(initialBoostedLender2Tranche1Pool2.lockedPlatformTokens);

        await nextLendingPool.executeRollover(lendingPool.address, [firstTrancheVault.address, secondTrancheVault.address]);

        const finalBalanceOfPool1PlatformToken = await platformToken.balanceOf(lendingPool.address);
        const finalBalanceOfPool2PlatformToken = await platformToken.balanceOf(nextLendingPool.address);

        expect(initialBalanceOfPool1PlatformToken.sub(finalBalanceOfPool1PlatformToken)).equals(initialBalanceOfPool1PlatformToken);
        expect(finalBalanceOfPool2PlatformToken.sub(initialBalanceOfPool2PlatformToken)).equals(initialBalanceOfPool1PlatformToken);

        const finalBoostedLender1Tranche0Pool2 = await nextLendingPool.s_trancheRewardables(0, await lender1.getAddress());
        const finalBoostedLender2Tranche0Pool2 = await nextLendingPool.s_trancheRewardables(0, await lender2.getAddress());
        const finalBoostedLender1Tranche1Pool2 = await nextLendingPool.s_trancheRewardables(1, await lender1.getAddress());
        const finalBoostedLender2Tranche1Pool2 = await nextLendingPool.s_trancheRewardables(1, await lender2.getAddress());
        
        console.log("finals pool 2")
        console.log(finalBoostedLender1Tranche0Pool2.lockedPlatformTokens);
        console.log(finalBoostedLender2Tranche0Pool2.lockedPlatformTokens);
        console.log(finalBoostedLender1Tranche1Pool2.lockedPlatformTokens);
        console.log(finalBoostedLender2Tranche1Pool2.lockedPlatformTokens);

        expect(finalBoostedLender1Tranche0Pool2.lockedPlatformTokens.sub(initialBoostedLender1Tranche0Pool2.lockedPlatformTokens)).equals(initialBoostedLender1Tranche0Pool1.lockedPlatformTokens)
        expect(finalBoostedLender2Tranche0Pool2.lockedPlatformTokens.sub(initialBoostedLender2Tranche0Pool2.lockedPlatformTokens)).equals(initialBoostedLender2Tranche0Pool1.lockedPlatformTokens)
        expect(finalBoostedLender2Tranche1Pool2.lockedPlatformTokens.sub(initialBoostedLender2Tranche1Pool2.lockedPlatformTokens)).equals(initialBoostedLender2Tranche1Pool1.lockedPlatformTokens)
        expect(finalBoostedLender2Tranche1Pool2.lockedPlatformTokens.sub(initialBoostedLender2Tranche1Pool2.lockedPlatformTokens)).equals(initialBoostedLender2Tranche1Pool1.lockedPlatformTokens)

        const borroweredAssetsFinal = await lendingPool.borrowedAssets();

        const finalBalancesAsset = await Promise.all([
          await asset.balanceOf(lendingPool.address),
          await asset.balanceOf(firstTrancheVault.address),
          await asset.balanceOf(secondTrancheVault.address),
          await asset.balanceOf(nextLendingPool.address),
          await asset.balanceOf(nextTrancheVault1.address),
          await asset.balanceOf(nextTrancheVault2.address)
        ])

        const finalBalancesVault = await Promise.all([
          await firstTrancheVault.balanceOf(await borrower.getAddress()),
          await firstTrancheVault.balanceOf(await lender1.getAddress()),
          await firstTrancheVault.balanceOf(await lender2.getAddress()),
          await secondTrancheVault.balanceOf(await borrower.getAddress()),
          await secondTrancheVault.balanceOf(await lender1.getAddress()),
          await secondTrancheVault.balanceOf(await lender2.getAddress()),
        ])

        const deltaBalancesAsset = [
          initialBalancesAsset[0].sub(finalBalancesAsset[0]),
          initialBalancesAsset[1].sub(finalBalancesAsset[1]),
          initialBalancesAsset[2].sub(finalBalancesAsset[2]),
          initialBalancesAsset[3].sub(finalBalancesAsset[3]),
          initialBalancesAsset[4].sub(finalBalancesAsset[4]),
          initialBalancesAsset[5].sub(finalBalancesAsset[5]),
        ]

        const deltaBalancesVault = [
          initialBalancesVault[0].sub(finalBalancesVault[0]),
          initialBalancesVault[1].sub(finalBalancesVault[1]),
          initialBalancesVault[2].sub(finalBalancesVault[2]),
          initialBalancesVault[3].sub(finalBalancesVault[3]),
          initialBalancesVault[4].sub(finalBalancesVault[4]),
          initialBalancesVault[5].sub(finalBalancesVault[5]),
        ]

        expect(deltaBalancesAsset[0]).equals(0)
        expect(deltaBalancesAsset[1]).equals(0)
        expect(deltaBalancesAsset[2]).equals(0)
        expect(deltaBalancesAsset[3]).equals(0)
        expect(deltaBalancesAsset[4]).equals(0)
        expect(deltaBalancesAsset[5]).equals(0)


        expect(deltaBalancesVault[0]).equals(0)
        expect(deltaBalancesVault[1]).equals(initialBalancesVault[1])
        expect(deltaBalancesVault[2]).equals(initialBalancesVault[2])
        expect(deltaBalancesVault[3]).equals(0)
        expect(deltaBalancesVault[4]).equals(initialBalancesVault[4])
        expect(deltaBalancesVault[5]).equals(initialBalancesVault[5])

        expect(borroweredAssetsFinal.sub(borroweredAssetsInitial)).equals(-borroweredAssetsInitial);
      })

      it("🏛️ borrower repays 0 USDC as principal", async () => {
        await usdc.connect(borrower).approve(lendingPool.address, USDC(0));
        await lendingPool.connect(borrower).borrowerRepayPrincipal();
      });

      it("transitions to REPAID stage", async () => {
        expect(await lendingPool.currentStage()).to.equal(STAGES.REPAID);
      });

      it("🏛️ borrower withdraws FLC(0) + excess spread (155USDC)", async () => {
        const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
        await lendingPool
          .connect(borrower)
          .borrowerWithdrawFirstLossCapitalAndExcessSpread();
        const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
        expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
          USDC(155)
        );

        // borrower is still allowed to pull out the excess spread?
      });

      it("transitions to FLC_WITHDRAWN stage", async () => {
        expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_WITHDRAWN);
      });

      it("have lender1 redeem their rewards", async () => {
        let amount = await lendingPool.lenderRewardsByTrancheRedeemable(await lender1.getAddress(), 0);
        expect(amount).gt(0);
        await lendingPool.connect(lender1).lenderRedeemRewardsByTranche(0, amount);
      })

      it("have lender 2 redeem their rewards", async () => {
        let amount = await lendingPool.lenderRewardsByTrancheRedeemable(await lender2.getAddress(), 1);
        expect(amount).gt(0);
        await lendingPool.connect(lender2).lenderRedeemRewardsByTranche(1, amount);
      })

      it("transitioned nextLendingPool to the BORROWED stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.BORROWED);
      });

      it("nextLendingPool contract now holds 2000 USDC (just the first loss)", async () => {
        expect(await usdc.balanceOf(nextLendingPool.address)).to.equal(USDC(2000));
      });

      it("⏳ 30 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower pays $125 interest", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(125));
        await nextLendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      });

      it("⏳ 30 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower pays $125 interest", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(125));
        await nextLendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      });

      it("⏳ 30 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower pays $125 interest", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(125));
        await nextLendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      });

      it("⏳ 30 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower pays $125 interest", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(125));
        await nextLendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      });

      it("⏳ 30 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower pays $125 interest", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(125));
        await nextLendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      });

      it("⏳ 30 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower pays $125 interest", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(125));
        await nextLendingPool.connect(borrower).borrowerPayInterest(USDC(125));
      });

      it("borrowerOutstandingInterest() is now 0 (borrower already paid 750 USDC)", async () => {
        expect(await nextLendingPool.borrowerOutstandingInterest()).to.equal(0);
      });

      it("borrowerExcessSpread() is now 155", async () => {
        expect(await nextLendingPool.borrowerExcessSpread()).to.equal(USDC(155));
      });

      it("⏳ 3 days pass by", async () => {
        // wait 30 days
        await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
        await ethers.provider.send("evm_mine", []);
      });

      it("🏛️ borrower repays 10000 USDC as principal", async () => {
        await usdc.connect(borrower).approve(nextLendingPool.address, USDC(10000));
        await nextLendingPool.connect(borrower).borrowerRepayPrincipal();
      });

      it("transitions to REPAID stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.REPAID);
      });

      it("🏛️ borrower withdraws FLC + excess spread (2050USDC)", async () => {
        const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
        await nextLendingPool
          .connect(borrower)
          .borrowerWithdrawFirstLossCapitalAndExcessSpread();
        const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
        //expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
        //  USDC(2050)
        //);
      });

      it("transitions to FLC_WITHDRAWN stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.FLC_WITHDRAWN);
      });
    });
  });
});
