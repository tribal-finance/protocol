import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";
import {
  DeployedContractsType,
  deployUnitranchePool,
} from "../../../lib/pool_deployments";
import { USDC, WAD } from "../../../test/v1-legacy/helpers/conversion";

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

  const PlatformTokenContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.PLATFORM_TOKEN_ADDRESS!
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
      name: "DontChange-SeedTestQAPool-1",
      token: "TST",
      stableCoinContractAddress: USDCContract.address,
      platformTokenContractAddress: PlatformTokenContract.address,
      minFundingCapacity: USDC(100),
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
      trancheBoostedAPRsWads: [WAD(0.1)],
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
  // wait a delay such that now > openedAt + fundingPeriodSeconds is true
  const fundingPeriodSeconds = await lendingPool.fundingPeriodSeconds();
  await network.provider.send("evm_increaseTime", [fundingPeriodSeconds.toNumber()]);
  await network.provider.send("evm_mine");

  tx = await lendingPool.connect(deployer).adminTransitionToFundedState();
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("the pool is funded");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
