import { ethers, upgrades, network } from "hardhat";
import dotenv from "dotenv";

console.log("network: ", network.name);
dotenv.config({ path: `./.env.${network.name}` });

import { STAGES_LOOKUP } from "../../test/helpers/stages";
import { USDC } from "../../test/helpers/conversion";

const LENDING_POOL_ADDRESS = "0xc6dC81d4A8eDadfDE5A878D896313346Fad8285a";

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
  console.log("Pool address: ", poolContract.address);

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

  console.log(
    "Current Pool Stage:",
    STAGES_LOOKUP[await poolContract.currentStage()]
  );

  let tx;

  /* !!!!!!!!!!!! 1. Open the Lending Pool !!!!!!!!!!!!!!!!!!!!*/
  // tx = await poolContract.connect(deployer).adminOpenPool();
  // tx.wait();
  // console.log("Lending Pool Opened");

  /* !!!!!!!!!!!! 2a. Deposit to the Lending Pool tranche#0 4000 + 4000  from lender 1 !!!!!!!!!!!!!!!!!!!!*/
  // tx = await USDCContract.connect(lender1).approve(
  //   trancheContracts[0].address,
  //   USDC(8000)
  // );
  // await tx.wait();
  // console.log("approved spend");
  // tx = await trancheContracts[0]
  //   .connect(lender1)
  //   .deposit(USDC(4000), lender1.address);
  // await tx.wait();
  // console.log("deposited money 1");
  // tx = await trancheContracts[0]
  //   .connect(lender1)
  //   .deposit(USDC(4000), lender1.address);
  // await tx.wait();
  // console.log("deposited money 2");

  /* !!!!!!!!!!!! 2a. Deposit to the Lending Pool tranche#1 2000  from lender 2 !!!!!!!!!!!!!!!!!!!!*/
  // tx = await USDCContract.connect(lender2).approve(
  //   trancheContracts[1].address,
  //   USDC(2000)
  // );
  // await tx.wait();
  // console.log("approved spend");
  // tx = await trancheContracts[1]
  //   .connect(lender2)
  //   .deposit(USDC(2000), lender2.address);
  // await tx.wait();
  // console.log("deposited money 3");

  /* !!!!!!!!!!!! 3. Move to funded state !!!!!!!!!!!!!!!!!!!!*/
  // tx = await poolContract.connect(deployer).adminTransitionToFundedState();
  // await tx.wait();
  // console.log("Lending Pool Transitioned to Funded State");
  // console.log(
  //   "Current Pool Stage:",
  //   STAGES_LOOKUP[await poolContract.currentStage()]
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
  // tx.wait(5);
  // console.log("borrowed!");
  // console.log(
  //   "borrower balance after (may display incorrectly): ",
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
