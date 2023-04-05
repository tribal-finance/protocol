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

describe("Depositing First Loss Capital", function () {
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
      const toDeposit = await contracts.lendingPool.minFundingCapacity();

      await usdc
        .connect(lender1)
        .approve(contracts.firstTrancheVault.address, toDeposit);
      await contracts.firstTrancheVault
        .connect(lender1)
        .deposit(toDeposit, await lender1.getAddress());
      await contracts.lendingPool
        .connect(deployer)
        .adminTransitionToFundedState();

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

  it("moves pool to FLC_DEPOSITED stage", async function () {
    const { borrower, usdc, firstLossCapitalVault, lendingPool } =
      await loadFixture(uniPoolFixture);

    const toDeposit = await lendingPool.firstLossCapitalDepositTarget();

    await usdc
      .connect(borrower)
      .approve(firstLossCapitalVault.address, toDeposit);

    await firstLossCapitalVault
      .connect(borrower)
      .deposit(toDeposit, await borrower.getAddress());

    expect(await lendingPool.currentStage()).to.eq(STAGES.FLC_DEPOSITED);
  });
});
