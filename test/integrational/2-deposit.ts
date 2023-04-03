import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import {
  FirstLossCapitalVault__factory,
  PoolFactory,
} from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployFactoryAndImplementations,
  deployUnitranchePool,
  _getDeployedContracts,
} from "../../lib/pool_deployments";
import testSetup from "../helpers/usdc";

describe("When Lender deposits to Open state pool", function () {
  async function uniPoolFixture() {
    const { signers, usdc } = await testSetup();
    const [deployer, lender1, lender2, lender3, borrower] = signers;
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    const afterDeploy = async (contracts: DeployedContractsType) => {
      await contracts.lendingPool.connect(deployer).adminOpenPool();
      await usdc
        .connect(lender1)
        .approve(contracts.firstTrancheVault.address, USDC(10000));
      await contracts.firstTrancheVault
        .connect(lender1)
        .deposit(USDC(10000), lender1.address);
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

  async function duoPoolFixture() {
    const { signers, usdc } = await testSetup();
    const [deployer, lender1, lender2, lender3, borrower] = signers;
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    const afterDeploy = async (contracts: DeployedContractsType) => {
      await contracts.lendingPool.connect(deployer).adminOpenPool();
      await usdc
        .connect(lender1)
        .approve(contracts.firstTrancheVault.address, USDC(8000));
      await contracts.firstTrancheVault
        .connect(lender1)
        .deposit(USDC(4000), lender1.address);
      await contracts.firstTrancheVault
        .connect(lender1)
        .deposit(USDC(4000), lender1.address);
      await usdc
        .connect(lender2)
        .approve(contracts.secondTrancheVault.address, USDC(2000));
      await contracts.secondTrancheVault
        .connect(lender2)
        .deposit(USDC(2000), lender2.address);
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

    await data.lendingPool.connect(deployer).adminOpenPool();

    return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
  }

  describe("When unitranche pool gets a deposit", function () {
    it("increases lenders balance", async function () {
      const { lenders, firstTrancheVault } = await uniPoolFixture();
      expect(
        await firstTrancheVault.balanceOf(await lenders[0].getAddress())
      ).to.eq(USDC(10000));
    });

    it("increases lenderStakedAssetsByTranche", async function () {
      const { lenders, firstTrancheVault, lendingPool } =
        await uniPoolFixture();
      expect(
        await lendingPool.lenderStakedAssetsByTranche(
          await lenders[0].getAddress(),
          0
        )
      ).to.eq(USDC(10000));
    });

    it("increases lenderAllStakedAssets", async function () {
      const { lenders, firstTrancheVault, lendingPool } =
        await uniPoolFixture();
      expect(
        await lendingPool.lenderAllStakedAssets(await lenders[0].getAddress())
      ).to.eq(USDC(10000));
    });

    it("calculates lenderTotalApyWad", async function () {
      const { lenders, lendingPool } = await uniPoolFixture();
      expect(
        await lendingPool.lenderTotalApyWad(await lenders[0].getAddress())
      ).to.eq((await lendingPool.trancheAPYsWads())[0]);
    });
  });

  describe("When duotranche pool opens", function () {
    it("increases lenders balances", async function () {
      const { lenders, firstTrancheVault, secondTrancheVault } =
        await duoPoolFixture();
      expect(
        await firstTrancheVault.balanceOf(await lenders[0].getAddress())
      ).to.eq(USDC(8000));
      expect(
        await secondTrancheVault.balanceOf(await lenders[1].getAddress())
      ).to.eq(USDC(2000));
    });

    it("increases lenderStakedAssetsByTranche", async function () {
      const { lenders, firstTrancheVault, lendingPool } =
        await duoPoolFixture();
      expect(
        await lendingPool.lenderStakedAssetsByTranche(
          await lenders[0].getAddress(),
          0
        )
      ).to.eq(USDC(8000));
      expect(
        await lendingPool.lenderStakedAssetsByTranche(
          await lenders[1].getAddress(),
          1
        )
      ).to.eq(USDC(2000));
    });

    it("increases lenderAllStakedAssets", async function () {
      const { lenders, firstTrancheVault, lendingPool } =
        await duoPoolFixture();
      expect(
        await lendingPool.lenderAllStakedAssets(await lenders[0].getAddress())
      ).to.eq(USDC(8000));
      expect(
        await lendingPool.lenderAllStakedAssets(await lenders[1].getAddress())
      ).to.eq(USDC(2000));
    });

    it("calculates lenderTotalApyWad", async function () {
      const { lenders, lendingPool } = await duoPoolFixture();

      expect(
        await lendingPool.lenderTotalApyWad(await lenders[0].getAddress())
      ).to.eq((await lendingPool.trancheAPYsWads())[0]);

      expect(
        await lendingPool.lenderTotalApyWad(await lenders[1].getAddress())
      ).to.eq((await lendingPool.trancheAPYsWads())[1]);
    });
  });
});
