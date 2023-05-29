import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";
import {
  deployDuotranchePool,
  DeployedContractsType,
  deployUnitranchePool,
} from "../../..//lib/pool_deployments";
import { STAGES_LOOKUP } from "../../../test/helpers/stages";
import { USDC } from "../../../test/helpers/conversion";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

const LENDING_POOL_ADDRESS = "0x234408847843711C03a484b9FaCa780fF893938b";

async function main() {
  const [deployer, lender1, lender2, borrower] = await ethers.getSigners();

  const USDCContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.USDC_ADDRESS!
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

  const trancheContracts = [];
  for (let i = 0; i < tranchesCount; i++) {
    const tva = await poolContract.trancheVaultAddresses(i);
    const contract = await ethers.getContractAt("TrancheVault", tva);
    trancheContracts.push(contract);
  }
  console.log(
    "Tranche Vault Addresses: ",
    trancheContracts.map((c) => c.address)
  );

  console.log(
    "Current Pool Stage:",
    STAGES_LOOKUP[await poolContract.currentStage()]
  );

  let tx;

  /* !!!!!!!!!!!! 0. Deposit first loss capital !!!!!!!!!!!!!!!!!!!!*/
  // tx = await USDCContract.connect(borrower).approve(
  //   poolContract.address,
  //   USDC(2000)
  // );
  // tx.wait();
  // console.log("approved spend");
  // tx = await poolContract.connect(borrower).borrowerDepositFirstLossCapital();

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
  const interestToRepay = USDC(250);
  tx = await USDCContract.connect(borrower).approve(
    poolContract.address,
    interestToRepay
  );
  await tx.wait();
  console.log("approved interst spend");
  tx = await poolContract
    .connect(borrower)
    .borrowerPayInterest(interestToRepay);
  await tx.wait();
  console.log("deposited interest money");

  /* !!!!!!!!!!!! 6. Redeem interest !!!!!!!!!!!!!!!!!!!!*/
  // tx = await poolContract.connect(lender1).lenderRedeemRewardsByTranche(0);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
