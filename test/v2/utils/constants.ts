import { ethers } from "hardhat";
import { string } from "hardhat/internal/core/params/argumentTypes";
const { parseEther } = ethers.utils


export const POOL_STORAGE_READER = ethers.utils.id("POOL_STORAGE_READER");

export const POOL_STORAGE_WRITER = ethers.utils.id("POOL_STORAGE_WRITER");

export const DEPLOYER = ethers.utils.id("DEPLOYER");

export const ADMIN = ethers.utils.id("ADMIN");

export const OWNER = ethers.utils.id("OWNER");

export const LENDER = ethers.utils.id("LENDER");

export const BORROWER = ethers.utils.id("BORROWER");

export const PROTOCOL = ethers.utils.id("PROTOCOL");

export const DEFAULT_LENDING_POOL_PARAMS = {
    name: "Test Pool",
    token: "TST",
    stableCoinContractAddress: "",
    platformTokenContractAddress: "",
    borrowerAddress: "",
    minFundingCapacity: ethers.utils.parseUnits("10000", 6),
    maxFundingCapacity: ethers.utils.parseUnits("12000", 6),
    fundingPeriodSeconds: 24 * 60 * 60,
    lendingTermSeconds: (365 * 24 * 60 * 60) / 2, // 90 days
    firstLossAssets: ethers.utils.parseUnits("2000", 6),
    repaymentRecurrenceDays: 30,
    gracePeriodDays: 5,
    borrowerTotalInterestRateWad: ethers.utils.parseEther("0.15"),
    protocolFeeWad: parseEther("0.1"),
    defaultPenalty: 0,
    penaltyRateWad: parseEther("0.02"),
    tranchesCount: 1,
    trancheAPRsWads: [parseEther("0.1")],
    trancheBoostedAPRsWads: [parseEther("0.1")],
    trancheBoostRatios: [ethers.utils.parseUnits("2", 12)],
    trancheCoveragesWads: [parseEther("1")],
  };
  export const DEFAULT_MULTITRANCHE_FUNDING_SPLIT = [[parseEther("0.8"), parseEther("0.75")], [parseEther("0.2"), parseEther("0.25")]];

