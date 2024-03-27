import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";

import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../../helpers/usdc";
import {
  DEFAULT_LENDING_POOL_PARAMS,
  DEFAULT_MULTITRANCHE_FUNDING_SPLIT,
} from "../../../lib/pool_deployments";

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

describe("Rollovers (2 Lender / 2 Tranche) ensure pool can't stretch beyond max capacities", function () {
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
      };
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
      const data = await duoPoolFixture();
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

    it("9000 USDC deposit from lender 1 & 2", async () => {
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

    it("sets lenderTotalExpectedRewardsByTranche for lender1", async () => {
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
        .approve(firstTrancheVault.address, USDC(1600));

      await firstTrancheVault
        .connect(lender2)
        .deposit(USDC(1600), await lender2.getAddress());

      await usdc
        .connect(lender2)
        .approve(secondTrancheVault.address, USDC(400));

      await secondTrancheVault
        .connect(lender2)
        .deposit(USDC(400), await lender2.getAddress());
    });

    it("In an ostentatious display of financial acumen, the lender manifests a predilection for the activation of rollovers", async () => {
      await lendingPool.connect(lender1).lenderEnableRollOver(true, true, true);
      await lendingPool.connect(lender2).lenderEnableRollOver(true, true, true);
    });

    it("sets lenderTotalExpectedRewardsByTranche for lender2 to 24 (2000* 1/2 year * 10%)", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender2.getAddress(),
          1
        )
      ).to.equal(USDC(24));
    });

    it("sets borrowerExpectedInterest() to 750 USDC", async () => {
      expect(await lendingPool.borrowerExpectedInterest()).to.equal(USDC(520));
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

    it("sets lenderTotalExpectedRewardsByTranche for lender1", async () => {
      expect(
        await lendingPool.lenderTotalExpectedRewardsByTranche(
          await lender1.getAddress(),
          0
        )
      ).to.equal(USDC(400));
    });

    it("sets allLendersInterest() to 504.999999 USDC", async () => {
      expect(await lendingPool.allLendersInterest()).to.equal("504000000");
    });

    it("👮 gets adminTransitionToFundedState() call from deployer", async () => {
      const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
      await network.provider.send("evm_increaseTime", [
        fundingPeriodSeconds.toNumber(),
      ]);
      await network.provider.send("evm_mine");
      await lendingPool.connect(deployer).adminTransitionToFundedState();
    });

    it("transitions to the FUNDED stage", async () => {
      expect(await lendingPool.currentStage()).to.equal(STAGES.FUNDED);
    });

    it("pool contract now holds 12000 USDC", async () => {
      expect(await usdc.balanceOf(lendingPool.address)).to.equal(USDC(12000));
    });

    it("borrower withdraws principal and gets 10000 USDC", async () => {
      const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
      await lendingPool.connect(borrower).borrow();
      const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
      expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
        USDC(10000)
      );
    });

    it("🏛️ borrower pays $1250 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(1250));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(1250));
    });

    it("🏛️ borrower pays $500 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(500));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(500));
    });

    it("🏛️ borrower pays $500 interest", async () => {
      await usdc.connect(borrower).approve(lendingPool.address, USDC(500));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(500));
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("🏛️ borrower pays $120 interest", async () => {
      console.log(await lendingPool.borrowerPenaltyAmount());
      await usdc.connect(borrower).approve(lendingPool.address, USDC(120));
      await lendingPool.connect(borrower).borrowerPayInterest(USDC(120));
    });

    it("⏳ 15 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [15 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("⏳ 30 days pass by", async () => {
      // wait 30 days
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
    });

    it("borrowerExcessSpread() is 1791", async () => {
      expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(1814));
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

        defaultParams.platformTokenContractAddress =
          await lendingPool.platformTokenContractAddress();
        defaultParams.stableCoinContractAddress =
          await lendingPool.stableCoinContractAddress();
        defaultParams.maxFundingCapacity = USDC(8000); // should rollover $2000 from lender2. The $9000 from lender should get skipped
        defaultParams.minFundingCapacity = USDC(1000);
        defaultParams.firstLossAssets = (
          await lendingPool.firstLossAssets()
        ).add(USDC(1000));

        const updatedLendingPoolParams = {
          ...defaultParams,
          borrowerAddress: await borrower.getAddress(),
        };

        const nextPoolAddr = await poolFactory.callStatic.deployPool(
          updatedLendingPoolParams,
          DEFAULT_MULTITRANCHE_FUNDING_SPLIT
        ); // view only execution to check lender address
        expect(await poolFactory.prevDeployedTranche(futureTranches[0])).equals(
          false
        );
        await poolFactory.deployPool(
          updatedLendingPoolParams,
          DEFAULT_MULTITRANCHE_FUNDING_SPLIT
        ); // run the state change
        expect(await poolFactory.prevDeployedTranche(futureTranches[0])).equals(
          true
        );

        nextLendingPool = await ethers.getContractAt(
          "LendingPool",
          nextPoolAddr
        );

        expect(nextPoolAddr).hexEqual(futureLenders[0]);

        const nextTrancheAddr = await nextLendingPool.trancheVaultAddresses(0);

        expect(nextTrancheAddr).hexEqual(futureTranches[0]);

        nextTrancheVault1 = await ethers.getContractAt(
          "TrancheVault",
          nextTrancheAddr
        );
        nextTrancheVault2 = await ethers.getContractAt(
          "TrancheVault",
          await nextLendingPool.trancheVaultAddresses(1)
        );
      });

      it("is initially in INITIAL stage and requires a deposit of 3000 USDC", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.INITIAL);
        expect(await nextLendingPool.firstLossAssets()).to.equal(USDC(3000));
      });

      it("3000 USDC flc deposit from the borrower", async () => {
        await expect(
          nextLendingPool.callStatic.adminOrOwnerRolloverFirstLossCaptial(
            lendingPool.address
          )
        ).to.be.revertedWith("InsufficientAllowance");
        // previous flc was 2000 so now borrower needs to approve an additonal 1000 since the new flc is 3000
        await usdc
          .connect(borrower)
          .approve(nextLendingPool.address, USDC(1000));
        await nextLendingPool.adminOrOwnerRolloverFirstLossCaptial(
          lendingPool.address
        );
      });

      it("transitions to the FLC_DEPOSITED stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(
          STAGES.FLC_DEPOSITED
        );
      });

      it("receives adminOpenPool() from deployer", async () => {
        const lenderCount = await lendingPool.lenderCount();
        await expect(
          nextLendingPool.executeRollover(lendingPool.address, [
            firstTrancheVault.address,
          ])
        ).to.be.revertedWith("LP004");
        await nextLendingPool.connect(deployer).adminOpenPool();
      });

      it("transitions to OPEN stage", async () => {
        expect(await nextLendingPool.currentStage()).to.equal(STAGES.OPEN);
      });

      it("expect the $2000 from lender1 was rolled over but not the captial from lender2", async () => {
        expect(
          await firstTrancheVault.balanceOf(await lender2.getAddress())
        ).equals(USDC(1600));
        expect(
          await secondTrancheVault.balanceOf(await lender2.getAddress())
        ).equals(USDC(400));
        await nextLendingPool.executeRollover(lendingPool.address, [
          firstTrancheVault.address,
          secondTrancheVault.address,
        ]);
        expect(
          await firstTrancheVault.balanceOf(await lender2.getAddress())
        ).equals(USDC(0));
        expect(
          await secondTrancheVault.balanceOf(await lender2.getAddress())
        ).equals(USDC(0));
        expect(await nextLendingPool.collectedAssets()).equals(USDC(2000));
      });
    });
  });
});
