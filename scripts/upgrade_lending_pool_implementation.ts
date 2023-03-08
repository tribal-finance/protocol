import { ethers, upgrades } from "hardhat";

async function main() {
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const pool = await upgrades.upgradeProxy(
    process.env.GOERLI_LENDING_POOL_PROXY_ADDRESS!,
    LendingPool
  );

  console.log(`Pool deployed to ${pool.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
