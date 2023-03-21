import { ethers } from "hardhat";
import dotenv from "dotenv";
import {
  CommonInput,
  deploy5daysFoundedPool,
  deployBorrowedFullInterestRepaidPool,
  deployBorrowedHalveInterestRepaidPool,
  deployBorrowedPool,
  deployFoundedPool,
  deployHalveFoundedPool,
  deployOpenPool,
} from "../../lib/pool_deployments";

dotenv.config();

async function main() {
  const [deployer, lender1, lender2, borrower] = await ethers.getSigners();

  const USDCContract = await ethers.getContractAt(
    "ERC20Upgradeable",
    process.env.GOERLI_USDC_ADDRESS!
  );

  const PoolFactory = await ethers.getContractAt(
    "PoolFactory",
    process.env.GOERLI_POOL_FACTORY_ADDRESS!
  );

  const commonInput: CommonInput = {
    deployer,
    lender1,
    lender2,
    borrower,
    usdcContract: USDCContract,
    poolFactoryContract: PoolFactory,
  };

  // // 1. Open pool
  // console.log("=== 1. Open pool");
  // const openPoolAddress = await deployOpenPool(commonInput);
  // console.log({ openPoolAddress });

  // // 2. halve founded pool
  // console.log("=== 2. halve founded pool");
  // const halveFoundedPoolAddress = await deployHalveFoundedPool(commonInput);
  // console.log({ halveFoundedPoolAddress });

  // // 3. founded pool
  // console.log("=== 3. founded pool");
  // const foundedPoolAddress = await deployFoundedPool(commonInput);
  // console.log({ foundedPoolAddress });

  // 4. borrowed pool
  // console.log("=== 4. borrowed pool");
  // const borrowedPoolAddress = await deployBorrowedPool(commonInput);
  // console.log({ borrowedPoolAddress });

  // 5. borrowed halve interst repaid pool
  // console.log("=== 5. borrowed halve interst repaid pool");
  // const borrowedHalveInterestRepaidPoolAddress =
  //   await deployBorrowedHalveInterestRepaidPool(commonInput);
  // console.log({ borrowedHalveInterestRepaidPoolAddress });

  // // 6. borrowed full interst repaid pool
  console.log("=== 6. borrowed full interst repaid pool");
  const borrowedFullInterestRepaidPoolAddress =
    await deployBorrowedFullInterestRepaidPool(commonInput);
  console.log({ borrowedFullInterestRepaidPoolAddress });

  // 7. 5 days funded pool
  // console.log("=== 7. 5 days founded pool");
  // for (let i = 0; i < 5; i++) {
  //   const fivedaysfoundedPoolAddress = await deploy5daysFoundedPool(
  //     commonInput
  //   );
  //   console.log({ fivedaysfoundedPoolAddress });
  // }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
