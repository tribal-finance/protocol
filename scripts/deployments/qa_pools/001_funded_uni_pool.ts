import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";
import {
  DeployedContractsType,
  deployUnitranchePool,
} from "../../../lib/pool_deployments";
import { USDC } from "../../../test/helpers/conversion";

dotenv.config({ path: `./.env.${network.name}` });

const WAIT_CONFIRMATIONS = 1;

async function main() {
  const [deployer] = await ethers.getSigners();

  const authorityContract = await ethers.getContractAt(
    "Authority",
    process.env.AUTHORITY_ADDRESS!
  );

  const USDCContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.USDC_ADDRESS!
  );

  const poolFactoryContract = await ethers.getContractAt(
    "PoolFactory",
    process.env.POOL_FACTORY_ADDRESS!
  );

  // create a custom lender wallet from private key
  const customLender = new ethers.Wallet(
    "0xea04481efa7cd2e37bf1d88c415607174764e179c7fcf0a67ace621eae8d0963",
    ethers.provider
  );

  // add lender to authority smart contract
  await authorityContract.connect(deployer).addLender(customLender.address);
  console.log("Added lender " + customLender.address + " to authority");

  // create a custom borrower wallet from private key
  const customBorrower = new ethers.Wallet(
    "0xe6152721962b7fa997fede6663ca13a7b3bf15b2bfa2b639139e4575a5b69c26",
    ethers.provider
  );

  // add lender to authority smart contract
  await authorityContract.connect(deployer).addBorrower(customBorrower.address);
  console.log("Added borrower " + customBorrower.address + " to authority");

  const cs = await deployUnitranchePool(
    poolFactoryContract,
    deployer,
    customBorrower,
    [customLender],
    {
      name: "DontChange-SeedQAPool-1",
      minFundingCapacity: USDC(100),
      maxFundingCapacity: USDC(100),
      firstLossAssets: USDC(20),
      stableCoinContractAddress: process.env.USDC_ADDRESS!,
      platformTokenContractAddress: process.env.TRIBAL_TOKEN_ADDRESS!,
      fundingPeriodSeconds: 15 * 24 * 60 * 60,
    },
    async (contracts: DeployedContractsType) => {
      return contracts;
    }
  );
  const { lendingPool, firstTrancheVault, secondTrancheVault } = cs;
  console.log(
    "============== Deployed Unitranche Pool: ",
    lendingPool.address,
    " =============="
  );

  let tx;
  // 1. deposit first loss capital
  tx = await USDCContract.connect(customBorrower).approve(
    lendingPool.address,
    await lendingPool.firstLossAssets()
  );
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("approved spend for borrower");
  tx = await lendingPool
    .connect(customBorrower)
    .borrowerDepositFirstLossCapital();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("borrower deposited first loss capital");

  // 2. open pool
  tx = await lendingPool.connect(deployer).adminOpenPool();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("the pool is open");

  // 3. deposit as custom lender
  tx = await USDCContract.connect(customLender).approve(
    firstTrancheVault.address,
    USDC(100)
  );
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("approved spend for borrower");
  tx = await firstTrancheVault
    .connect(customLender)
    .deposit(USDC(100), customLender.address);
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("deposited 100 USDC as custom lender");

  // 4. deposit move to funded stage
  tx = await lendingPool.connect(deployer).adminTransitionToFundedState();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("the pool is funded");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
