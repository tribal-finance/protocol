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
  deployTribalToken,
} from "../../lib/pool_deployments";
import testSetup from "../helpers/usdc";
import STAGES from "../helpers/stages";

describe("Boosting the APY", function () {
  async function uniPoolFixture() {
    const { signers, usdc } = await testSetup();
    const [deployer, lender1, lender2, lender3, borrower] = signers;
    const lenders = [lender1, lender2, lender3];

    const tribalToken = await deployTribalToken(deployer, lenders);

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    const afterDeploy = async (contracts: DeployedContractsType) => {
      await contracts.lendingPool.connect(deployer).adminOpenPool();
      await usdc
        .connect(lender1)
        .approve(contracts.firstTrancheVault.address, USDC(1000));
      await contracts.firstTrancheVault
        .connect(lender1)
        .deposit(USDC(1000), lender1.address);
      return contracts;
    };

    const data = await deployUnitranchePool(
      poolFactory,
      deployer,
      borrower,
      lenders,
      { platformTokenContractAddress: tribalToken.address },
      afterDeploy
    );

    return {
      ...data,
      tribalToken,
      usdc,
      ...(await _getDeployedContracts(poolFactory)),
    };
  }

  // 2 TRIBAL boost 1 USDC APR
  // unboosted APR is 10%
  // booster APR is 15%
  describe("Open unitranche pool with lender1 deposit of 1000 USDC gets a partial boost (locks 1000 TRIBAL)", function () {
    it("is bumps APY to 12.5%", async () => {
      const { usdc, tribalToken, lenders, lendingPool, firstTrancheVault } =
        await loadFixture(uniPoolFixture);

      const trancheAprBefore = await lendingPool.lenderEffectiveAprByTrancheWad(
        await lenders[0].getAddress(),
        0
      );
      expect(trancheAprBefore).to.eq(WAD("0.1"));

      const amountToLock = ethers.utils.parseEther("1000");

      await tribalToken
        .connect(lenders[0])
        .approve(lendingPool.address, amountToLock);

      await lendingPool
        .connect(lenders[0])
        .lenderLockPlatformTokensByTranche(0, amountToLock);

      const trancheAprAfter = await lendingPool.lenderEffectiveAprByTrancheWad(
        await lenders[0].getAddress(),
        0
      );

      expect(trancheAprAfter).to.eq(WAD("0.125"));
    });
  });

  describe("Open unitranche pool with lender1 deposit of 1000 USDC gets a full boost (locks 2000 TRIBAL)", function () {
    it("is bumps APY to 15%", async () => {
      const { usdc, tribalToken, lenders, lendingPool, firstTrancheVault } =
        await loadFixture(uniPoolFixture);

      const trancheAprBefore = await lendingPool.lenderEffectiveAprByTrancheWad(
        await lenders[0].getAddress(),
        0
      );

      const amountToLock = ethers.utils.parseEther("2000");

      await tribalToken
        .connect(lenders[0])
        .approve(lendingPool.address, amountToLock);

      await lendingPool
        .connect(lenders[0])
        .lenderLockPlatformTokensByTranche(0, amountToLock);

      const trancheAprAfter = await lendingPool.lenderEffectiveAprByTrancheWad(
        await lenders[0].getAddress(),
        0
      );

      expect(trancheAprAfter).to.eq(WAD("0.15"));
    });
  });

  describe("Open unitranche pool with lender1 deposit of 1000 USDC gets overboost (locks 3000 TRIBAL)", function () {
    it("will revert", async () => {
      const { usdc, tribalToken, lenders, lendingPool, firstTrancheVault } =
        await loadFixture(uniPoolFixture);

      const amountToLock = ethers.utils.parseEther("3000");

      await tribalToken
        .connect(lenders[0])
        .approve(lendingPool.address, amountToLock);

      await expect(
        lendingPool
          .connect(lenders[0])
          .lenderLockPlatformTokensByTranche(0, amountToLock)
      ).to.be.reverted;

      const trancheAprAfter = await lendingPool.lenderEffectiveAprByTrancheWad(
        await lenders[0].getAddress(),
        0
      );

      expect(trancheAprAfter).to.eq(WAD("0.1"));
    });
  });
});