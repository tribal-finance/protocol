import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";
import {
  DeployedContractsType,
  deployDuotranchePool,
  deployUnitranchePool,
} from "../../../lib/pool_deployments";
import { USDC, WAD } from "../../../test/helpers/conversion";

dotenv.config({ path: `./.env.${network.name}` });

const WAIT_CONFIRMATIONS = 1;
const AFTER_APPROVE_WAIT_CONFIRMATIONS = 3;

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

  const cs = await deployDuotranchePool(
    poolFactoryContract,
    deployer,
    customBorrower,
    [customLender],
    {
      name: "DontChange-SeedTestQAPool-3",
      token: "TST",
      stableCoinContractAddress: USDCContract.address,
      platformTokenContractAddress: PlatformTokenContract.address,
      minFundingCapacity: USDC(200),
      maxFundingCapacity: USDC(300),
      fundingPeriodSeconds: 60 * 60 * 24 * 300,
      lendingTermSeconds: 60 * 60 * 24 * 300,
      borrowerAddress: "0xbc2C99956b273AAE2bd06DD5ef92F5DDC1Dc310B",
      firstLossAssets: USDC(1),
      borrowerTotalInterestRateWad: WAD(0.3),
      repaymentRecurrenceDays: 30,
      gracePeriodDays: 5,
      protocolFeeWad: WAD(0.1),
      defaultPenalty: 0,
      penaltyRateWad: WAD(0.02),
      tranchesCount: 2,
      trancheAPRsWads: [WAD(0.1), WAD(0.12)],
      trancheBoostedAPRsWads: [WAD(0.11), WAD(0.14)],
      trancheBoostRatios: [
        ethers.utils.parseUnits("2", 12),
        ethers.utils.parseUnits("2", 12),
      ],
      trancheCoveragesWads: [WAD(0.8), WAD(0.2)],
    },
    async (contracts: DeployedContractsType) => {
      return contracts;
    }
  );
  const { lendingPool, firstTrancheVault } = cs;
  const secondTrancheVault = await ethers.getContractAt(
    "TrancheVault",
    await lendingPool.trancheVaultAddresses(1)
  );

  console.log(
    "============== Deployed Multi Pool: ",
    lendingPool.address,
    " =============="
  );

  let tx;
  // 1. deposit first loss capital
  tx = await USDCContract.connect(customBorrower).approve(
    lendingPool.address,
    await lendingPool.firstLossAssets()
  );
  await tx.wait(AFTER_APPROVE_WAIT_CONFIRMATIONS);
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

  // 3. deposit 50 usdc to first tranche as custom lender
  tx = await USDCContract.connect(customLender).approve(
    firstTrancheVault.address,
    USDC(50)
  );
  await tx.wait(AFTER_APPROVE_WAIT_CONFIRMATIONS);
  console.log("approved spend for borrower");

  tx = await firstTrancheVault
    .connect(customLender)
    .deposit(USDC(50), customLender.address);
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("deposited 50 USDC to senior tranhce as custom lender");

  // 4. Lock 100 platform tokens and boost senior tranche to 11%
  tx = await PlatformTokenContract.connect(customLender).approve(
    lendingPool.address,
    ethers.utils.parseEther("100")
  );
  await tx.wait(AFTER_APPROVE_WAIT_CONFIRMATIONS);
  console.log("approved PLATFORM spend for lender");

  tx = await lendingPool
    .connect(customLender)
    .lenderLockPlatformTokensByTranche(0, ethers.utils.parseEther("100"));
  await tx.wait(3);
  console.log("locked 100 PLATFORM tokens");

  // 5. deposit 20 usdc to second tranche as custom lender
  tx = await USDCContract.connect(customLender).approve(
    secondTrancheVault.address,
    USDC(20)
  );
  await tx.wait(AFTER_APPROVE_WAIT_CONFIRMATIONS);
  console.log("approved spend for custom lender");

  tx = await secondTrancheVault
    .connect(customLender)
    .deposit(USDC(20), customLender.address);
  await tx.wait(WAIT_CONFIRMATIONS);
  console.log("deposited 20 USDC to junior tranche as custom lender");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
