import { ethers, upgrades } from "hardhat";
import dotenv from "dotenv";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployUnitranchePool,
} from "../../lib/pool_deployments";
import { STAGES_LOOKUP } from "../../test/helpers/stages";
import { USDC } from "../../test/helpers/conversion";
import { lendingPoolSol } from "../../typechain-types/contracts/old";

dotenv.config();

const LENDING_POOL_ADDRESS = "0x4770d3515652dc64a7B53828bd980c571c23aa1C";

async function main() {
  const [deployer, lender1, lender2, borrower] = await ethers.getSigners();

  const USDCContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.GOERLI_USDC_ADDRESS!
  );

  console.log("Reading contract...");
  const poolContract = await ethers.getContractAt(
    "LendingPool",
    LENDING_POOL_ADDRESS
  );

  const tranchesCount = await poolContract.tranchesCount();
  console.log("Tranches Count: ", tranchesCount);
  console.log(
    "MinFundingCapacity: ",
    ethers.utils.formatUnits(await poolContract.minFundingCapacity(), 6)
  );
  console.log(
    "MaxFundingCapacity: ",
    ethers.utils.formatUnits(await poolContract.maxFundingCapacity(), 6)
  );
  console.log(
    "Collected Assets: ",
    ethers.utils.formatUnits(await poolContract.collectedAssets(), 6)
  );

  const trancheVaultAddresses = await poolContract.trancheVaultAddresses();
  const trancheContracts = [];
  for (let tva of trancheVaultAddresses) {
    const contract = await ethers.getContractAt("TrancheVault", tva);
    trancheContracts.push(contract);
  }
  console.log("Tranche Vault Addresses: ", trancheVaultAddresses);

  const flcAddress = await poolContract.firstLossCapitalVaultAddress();
  const flcConttract = await ethers.getContractAt(
    "FirstLossCapitalVault",
    flcAddress
  );
  console.log("First loss capital address:", flcAddress);

  console.log(
    "Current Pool Stage:",
    STAGES_LOOKUP[await poolContract.currentStage()]
  );

  let tx;

  /* !!!!!!!!!!!! 1. Open the Lending Pool !!!!!!!!!!!!!!!!!!!!*/
  // tx = await poolContract.connect(deployer).adminOpenPool();
  // tx.wait();
  // console.log("Lending Pool Opened");

  /* !!!!!!!!!!!! 2. Deposit to the Lending Pool !!!!!!!!!!!!!!!!!!!!*/
  // tx = await USDCContract.connect(lender1).approve(
  //   trancheContracts[0].address,
  //   USDC(10000)
  // );
  // await tx.wait();
  // console.log("approved spend");
  // tx = await trancheContracts[0]
  //   .connect(lender1)
  //   .deposit(USDC(10000), lender1.address);
  // await tx.wait();
  // console.log("deposited money");

  /* !!!!!!!!!!!! 3. Move to funded state !!!!!!!!!!!!!!!!!!!!*/
  // tx = await poolContract.connect(deployer).adminTransitionToFundedState();
  // await tx.wait();
  // console.log("Lending Pool Transitioned to Funded State");
  // console.log(
  //   "Current Pool Stage:",
  //   STAGES_LOOKUP[await poolContract.currentStage()]
  // );
  // console.log(
  //   "FLC expected deposit:",
  //   ethers.utils.formatUnits(
  //     await poolContract.firstLossCapitalDepositTarget(),
  //     6
  //   )
  // );

  /* !!!!!!!!!!!! 4. Deposit first loss capital !!!!!!!!!!!!!!!!!!!!*/
  // tx = await USDCContract.connect(borrower).approve(
  //   flcConttract.address,
  //   USDC(2000)
  // );
  // await tx.wait();
  // console.log("approved FLC spend");
  // tx = await flcConttract
  //   .connect(borrower)
  //   .deposit(USDC(2000), lender1.address);
  // await tx.wait();
  // console.log("deposited FLC money");

  /* !!!!!!!!!!!! 5. Borrow !!!!!!!!!!!!!!!!!!!!*/
  // console.log(
  //   "borrower balance before: ",
  //   ethers.utils.formatUnits(await USDCContract.balanceOf(borrower.address), 6)
  // );
  // tx = await poolContract.connect(borrower).borrow();
  // tx.wait();
  // console.log("borrowed!");
  // console.log(
  //   "borrower balance after: ",
  //   ethers.utils.formatUnits(await USDCContract.balanceOf(borrower.address), 6)
  // );
  // console.log(
  //   "Current Pool Stage:",
  //   STAGES_LOOKUP[await poolContract.currentStage()]
  // );

  /* !!!!!!!!!!!! 6. Pay interest !!!!!!!!!!!!!!!!!!!!*/
  tx = await USDCContract.connect(borrower).approve(
    poolContract.address,
    USDC(150)
  );
  await tx.wait();
  console.log("approved interst spend");
  tx = await poolContract.connect(borrower).borrowerPayInterest(USDC(150));
  await tx.wait();
  console.log("deposited interest money");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});