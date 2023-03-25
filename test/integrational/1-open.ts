import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import {
  FirstLossCapitalVault__factory,
  PoolFactory,
} from "../../typechain-types";
import { USDC, WAD } from "../helpers/conversion";
import {
  deployFactoryAndImplementations,
  deployUnitranchePool,
} from "../../lib/pool_deployments";

describe("When Pool moves to Open state", function () {
  async function fixture() {
    const [deployer, lender1, lender2, lender3, borrower] =
      await ethers.getSigners();
    const lenders = [lender1, lender2, lender3];

    const poolFactory: PoolFactory = await deployFactoryAndImplementations(
      deployer,
      borrower,
      lenders
    );

    return await deployUnitranchePool(poolFactory, deployer, borrower, lenders);
  }
});
