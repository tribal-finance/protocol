import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";
import {
  DeployedContractsType,
  deployUnitranchePool,
} from "../../../lib/pool_deployments";
import { USDC, WAD } from "../../../test/helpers/conversion";

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

  const TribalTokenContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.TRIBAL_TOKEN_ADDRESS!
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
      name: "DontChange-SeedTestQAPool-4",
      token: "TST",
      stableCoinContractAddress: USDCContract.address,
      platformTokenContractAddress: TribalTokenContract.address,
      minFundingCapacity: USDC(70),
      maxFundingCapacity: USDC(300),
      fundingPeriodSeconds: 60 * 30,
      lendingTermSeconds: 60 * 60 * 24 * 300,
      borrowerAddress: customBorrower.address,
      firstLossAssets: USDC(1),
      borrowerTotalInterestRateWad: WAD(0.3),
      repaymentRecurrenceDays: 30,
      gracePeriodDays: 5,
      protocolFeeWad: WAD(0.1),
      defaultPenalty: 0,
      penaltyRateWad: WAD(0.02),
      tranchesCount: 1,
      trancheAPRsWads: [WAD(0.1)],
      trancheBoostedAPRsWads: [WAD(0.11)],
      trancheBoostRatios: [ethers.utils.parseUnits("2", 12)],
      trancheCoveragesWads: [WAD(1)],
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
  await tx.wait(3);
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
    USDC(70)
  );
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("approved spend for borrower");
  tx = await firstTrancheVault
    .connect(customLender)
    .deposit(USDC(70), customLender.address);
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("deposited 70 USDC as custom lender");

  // 4. deposit move to funded stage
  tx = await lendingPool.connect(deployer).adminTransitionToFundedState();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("the pool is funded");

  // 5. borrow
  tx = await lendingPool.connect(customBorrower).borrow();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("borrowed");

  // 6. pay all the interest
  const outstandingInterest = await lendingPool.borrowerExpectedInterest();
  console.log(
    "outstanding pool interest: ",
    ethers.utils.formatUnits(outstandingInterest, 6),
    " USDC"
  );
  tx = await USDCContract.connect(customBorrower).approve(
    lendingPool.address,
    outstandingInterest
  );
  await tx.wait(3);
  console.log("approved spend");
  tx = await lendingPool
    .connect(customBorrower)
    .borrowerPayInterest(outstandingInterest);
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("paid all the interest");

  // 6. repay principal
  const outstandingPrincipal = await lendingPool.borrowedAssets();
  tx = await USDCContract.connect(customBorrower).approve(
    lendingPool.address,
    outstandingPrincipal
  );
  await tx.wait(3);
  console.log("approved spend");

  tx = await lendingPool.connect(customBorrower).borrowerRepayPrincipal();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("repaid principal");

  // 7. time travel to maturity by subtracting funding term from fundedAt
  let currentFundedAt = await (await lendingPool.fundedAt()).toNumber();
  let lendingTermSeconds = await (
    await lendingPool.lendingTermSeconds()
  ).toNumber();

  tx = await lendingPool
    .connect(deployer)
    .__todoRemoveMeChangeFundedAt(currentFundedAt - lendingTermSeconds);
  console.log("time traveled to maturity");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
