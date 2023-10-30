import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../../helpers/usdc";
import {
  ITestUSDC,
  LendingPool,
  PoolFactory,
  TrancheVault,
  PlatformToken,
} from "../../../typechain-types";
import { USDC, WAD } from "../../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
  deployPlatformToken,
  DEFAULT_LENDING_POOL_PARAMS,
} from "../../../lib/pool_deployments";
import testSetup from "../../helpers/usdc";
import STAGES from "../../helpers/stages";
import { pool } from "../../../typechain-types/contracts";
import exp from "constants";

describe("Run borrowerPenalty logic", function () {
  context("For unitranche pool", async function () {
    async function uniPoolFixture() {
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

      const data = await deployUnitranchePool(
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

    /**
     * pool settings:
     * - lending term: 182.5 days ( 1/2 year )
     * - lender annual yield: 10%
     * - lender adjusted yield: 5%
     * - borrower annual interest rate: 15%
     * - borrower adjusted interest rate: 7.5%
     * - funds collected: $10,000
     * - lender 1 deposit: $8,000
     * - lender 2 deposit: $2,000
     */

    let usdc: ITestUSDC,
      platformToken: PlatformToken,
      lendingPool: LendingPool,
      poolFactory: PoolFactory,
      firstTrancheVault: TrancheVault,
      deployer: Signer,
      borrower: Signer,
      lender1: Signer,
      lender2: Signer;

    before(async () => {
      const data = await loadFixture(uniPoolFixture);
      usdc = data.usdc;
      platformToken = data.platformToken;
      lendingPool = data.lendingPool;
      poolFactory = data.poolFactory;
      firstTrancheVault = data.firstTrancheVault;
      deployer = data.deployer;
      borrower = data.borrower;
      lender1 = data.lenders[0];
      lender2 = data.lenders[1];
    });

    it("deploy pool", async () => {
      const defaultParams = DEFAULT_LENDING_POOL_PARAMS;
    
      defaultParams.minFundingCapacity = ethers.utils.parseUnits("80000", 6);
      defaultParams.maxFundingCapacity = ethers.utils.parseUnits("100000", 6);
      defaultParams.fundingPeriodSeconds = 30;
      defaultParams.lendingTermSeconds = 43200; // This is half a day (12 hours) in seconds.
      defaultParams.firstLossAssets = ethers.BigNumber.from(219178082);
      defaultParams.repaymentRecurrenceDays = 1;
      defaultParams.gracePeriodDays = 0;
      defaultParams.borrowerTotalInterestRateWad = ethers.utils.parseUnits("1", 18);
      defaultParams.protocolFeeWad = ethers.utils.parseUnits("0.1", 18);
      defaultParams.defaultPenalty = ethers.utils.parseUnits("0.1", 18);
      defaultParams.penaltyRateWad = ethers.utils.parseUnits("0.02", 18);
      defaultParams.tranchesCount = 2;
      defaultParams.trancheAPRsWads = ["0.12", "0.18"].map(val => ethers.utils.parseUnits(val, 18));
      defaultParams.trancheBoostedAPRsWads = ["0.12", "0.18"].map(val => ethers.utils.parseUnits(val, 18));
      defaultParams.trancheBoostRatios = ["2", "2"].map(val => ethers.utils.parseUnits(val, 18));
      defaultParams.trancheCoveragesWads = ["1", "1"].map(val => ethers.utils.parseUnits(val, 18));
      
      const lendingPoolParams = { ...defaultParams, borrowerAddress: await borrower.getAddress() };
      const poolAddress = await poolFactory.callStatic.deployPool(lendingPoolParams, [[WAD(.8), WAD(.8)], [WAD(.2), WAD(.2)]]); 
      await poolFactory.deployPool(lendingPoolParams, [[WAD(.8), WAD(.8)], [WAD(.2), WAD(.2)]]); 
      
      lendingPool = await ethers.getContractAt("LendingPool", poolAddress);

    });

    it("Set state to flc_deposited", async () => {
      const firstloss = await lendingPool.firstLossAssets();
      let tx = await usdc.connect(borrower).approve(lendingPool.address, firstloss);
      tx = await lendingPool.connect(borrower).borrowerDepositFirstLossCapital();
    })

    it("Set state to open and fund", async () => {
       await lendingPool.adminOpenPool();
       const maxFundingCapacity = ((await lendingPool.maxFundingCapacity()).add(await lendingPool.minFundingCapacity())).div(2);
       const Vault = await lendingPool.trancheVaultAddresses(0);
       const vault = await ethers.getContractAt("TrancheVault", Vault);
       const depositAmount = await vault.maxFundingCapacity();

       await usdc.connect(lender1).approve(Vault, depositAmount);

       await vault.connect(lender1).deposit(depositAmount, await lender1.getAddress());
      })
      
      it("Set state to funded and enter borrow state", async () => {
        const seconds = await lendingPool.fundingPeriodSeconds();
        await network.provider.send("evm_increaseTime", [seconds.toNumber()]);

        await lendingPool.adminTransitionToFundedState();
        await lendingPool.connect(borrower).borrow();
        expect(await lendingPool.currentStage()).equals(STAGES.BORROWED)
      })

      it("0 default penalty since the loan has just begun", async () => {
        expect(await lendingPool.borrowerPenaltyAmount()).equals(0);
      })

      it("Should have a non-zero default penalty since loan has completely matured and no payments have been made", async () => {
        const seconds = await lendingPool.lendingTermSeconds();

        console.log(`timestamp: ${new Date(((await ethers.provider.getBlock('latest')).timestamp) * 1000).toLocaleString()}`);
        await network.provider.send("evm_increaseTime", [Math.floor(seconds.toNumber() * 1.1)]);
        await network.provider.send("evm_mine");
        console.log(`timestamp: ${new Date(((await ethers.provider.getBlock('latest')).timestamp) * 1000).toLocaleString()}`);

        expect(await lendingPool.borrowerPenaltyAmount()).not.equals(0);
      })
  });
});
