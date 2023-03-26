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
      await contracts.lendingPool.connect(deployer).openPool();
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
      await contracts.lendingPool.connect(deployer).openPool();
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

    await data.lendingPool.connect(deployer).openPool();

    return { ...data, usdc, ...(await _getDeployedContracts(poolFactory)) };
  }

  describe("When unitranche pool gets a deposit", function () {
    it("increases lenders balance", async function () {
      const { lenders, firstTrancheVault } = await uniPoolFixture();
      expect(
        await firstTrancheVault.balanceOf(await lenders[0].getAddress())
      ).to.eq(USDC(10000));
    });
  });

  describe("When duotranche pool opens", function () {});
});
