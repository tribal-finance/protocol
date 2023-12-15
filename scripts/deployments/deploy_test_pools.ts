import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployUnitranchePool,
} from "../../lib/pool_deployments";
import { WAD } from "../../test/v1-legacy/helpers/conversion";

dotenv.config({ path: `./.env.${network.name}` });

async function main() {
  const [deployer, lender1, lender2, borrower] = await ethers.getSigners();

  const USDCContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.USDC_ADDRESS!
  );

  const poolFactoryContract = await ethers.getContractAt(
    "PoolFactory",
    process.env.POOL_FACTORY_ADDRESS!
  );

  // 1. Unitranche Pool
  const cs = await deployUnitranchePool(
    poolFactoryContract,
    deployer,
    borrower,
    [lender1, lender2],
    {
      stableCoinContractAddress: process.env.USDC_ADDRESS!,
      platformTokenContractAddress: process.env.PLATFORM_TOKEN_ADDRESS!,
      trancheBoostedAPRsWads: [WAD(0.11)],
      // fundingPeriodSeconds: 15 * 24 * 60 * 60,
    },
    async (contracts: DeployedContractsType) => {
      // await contracts.lendingPool.connect(deployer).adminOpenPool();
      return contracts;
    }
  );
  console.log("Deployed Unitranche Pool:", cs.lendingPool.address);

  // 2. Duotranche Pool
  // const cs = await deployDuotranchePool(
  //   poolFactoryContract,
  //   deployer,
  //   borrower,
  //   [lender1, lender2],
  //   {
  //     stableCoinContractAddress: process.env.USDC_ADDRESS!,
  //     platformTokenContractAddress: process.env.PLATFORM_TOKEN_ADDRESS!,
  //     // fundingPeriodSeconds: 30 * 24 * 60 * 60,
  //   },
  //   async (contracts: DeployedContractsType) => {
  //     // await contracts.lendingPool.connect(deployer).adminOpenPool();
  //     return contracts;
  //   }
  // );
  // console.log("Deployed Duotranche Pool:", cs.lendingPool.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
