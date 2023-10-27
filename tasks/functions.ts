import { parse } from "dotenv";
import { task } from "hardhat/config";
import { LendingPool } from "../typechain-types";
import { getMostCurrentContract } from "./io";


task("encode-pool-initializer", "This creates the msg.data for a deploy pool transaction")
    .addParam("name", "Nickname for the pool")
    .addParam("token", "Unused parameter (gigster keeps giving us surprises)")
    .addParam("stableCoinContractAddress", "The Ethereum address of the preferred stable coin")
    .addParam("platformTokenContractAddress", "The Ethereum address of the platform's token or tribal governance")
    .addParam("minFundingCapacity", "The minimum funding capacity for the pool (standard fixed point number that will be scaled by e18)")    
    .addParam("maxFundingCapacity", "The maximum funding capacity for the pool (standard fixed point number that will be scaled by e18)")
    .addParam("fundingPeriodSeconds", "The funding period for the pool in seconds")
    .addParam("lendingTermSeconds", "The term of lending in seconds")
    .addParam("borrowerAddress", "The Ethereum address of the borrower")
    .addParam("firstLossAssets", "The first loss assets amount")
    .addParam("borrowerTotalInterestRateWad", "The total interest rate for the borrower in wad format")
    .addParam("repaymentRecurrenceDays", "The recurrence of repayment in days")
    .addParam("gracePeriodDays", "The grace period for repayment in days")
    .addParam("protocolFeeWad", "The protocol fee in wad format")
    .addParam("defaultPenalty", "The default penalty amount")
    .addParam("penaltyRateWad", "The penalty rate in wad format")
    .addParam("tranchesCount", "The count of tranches")
    .addParam("trancheAPRsWads", "The APRs for each tranche in wad format (comma-separated)")
    .addParam("trancheBoostedAPRsWads", "The boosted APRs for each tranche in wad format (comma-separated)")
    .addParam("trancheBoostRatios", "The boost ratios for each tranche (comma-separated)")
    .addParam("trancheCoveragesWads", "The coverages for each tranche in wad format (comma-separated)")
    .addParam("fundingSplitWads", "The fundingSplitWads for each tranche")
    .setAction(async (taskArgs, hre) => {
        const {ethers} = hre;
        const {parseEther, parseUnits} = ethers.utils;

        const LendingPoolParams = [
            taskArgs.name, 
            taskArgs.token,
            taskArgs.stableCoinContractAddress,
            taskArgs.platformTokenContractAddress,
            parseUnits(taskArgs.minFundingCapacity, 6),
            parseUnits(taskArgs.maxFundingCapacity, 6),
            taskArgs.fundingPeriodSeconds,
            taskArgs.lendingTermSeconds,
            taskArgs.borrowerAddress,
            parseUnits(taskArgs.firstLossAssets, 6),
            parseEther(taskArgs.borrowerTotalInterestRateWad),
            taskArgs.repaymentRecurrenceDays,
            taskArgs.gracePeriodDays,
            parseEther(taskArgs.protocolFeeWad),
            parseEther(taskArgs.defaultPenalty),
            parseEther(taskArgs.penaltyRateWad),
            taskArgs.tranchesCount,
            taskArgs.trancheAPRsWads.split(',').map(parseEther),
            taskArgs.trancheBoostedAPRsWads.split(',').map(parseEther),
            taskArgs.trancheBoostRatios.split(',').map(parseEther),
            taskArgs.trancheCoveragesWads.split(',').map(parseEther)
        ];

        const fundingSplitWads = taskArgs.fundingSplitWads.split(':');
        const fundingSplitWads2D = []
        for(let i = 0; i < fundingSplitWads.length; i++) {
            const extrema = fundingSplitWads[i].split(',').map(parseEther);
            fundingSplitWads2D.push(extrema)
        }

        const PoolFactory = await ethers.getContractFactory("PoolFactory");
        const msgData = PoolFactory.interface.encodeFunctionData("deployPool", [LendingPoolParams, fundingSplitWads2D]);

        console.log(msgData);
    });

task("borrowerPenaltyAmount", "This reads the penalty amount for borrowers")
    .addParam("poolAddress", "address of the pool")
    .setAction(async (taskArgs, hre) => {
        const {ethers} = hre;
        const {parseEther, isAddress} = ethers.utils;
        const { poolAddress } = taskArgs;
        const network = hre.network.name;

        if (poolAddress && !isAddress(poolAddress)) {
            throw new Error(`pool-address is not a valid address ${poolAddress}`);
        }

        let lendingPool: LendingPool = !poolAddress ? await ethers.getContractAt("LendingPool", getMostCurrentContract("lendingPoolV1", network).contractAddress) : await ethers.getContractAt("LendingPool", poolAddress);

        console.log("Borrower Penalty Amount")
        console.log(await lendingPool.borrowerPenaltyAmount());
    });
