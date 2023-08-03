import { task } from "hardhat/config";


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

        const LendingPoolParams = [
            taskArgs.name, 
            taskArgs.token,
            taskArgs.stableCoinContractAddress,
            taskArgs.platformTokenContractAddress,
            taskArgs.minFundingCapacity,
            taskArgs.maxFundingCapacity,
            taskArgs.fundingPeriodSeconds,
            taskArgs.lendingTermSeconds,
            taskArgs.borrowerAddress,
            taskArgs.firstLossAssets,
            taskArgs.borrowerTotalInterestRateWad,
            taskArgs.repaymentRecurrenceDays,
            taskArgs.gracePeriodDays,
            taskArgs.protocolFeeWad,
            taskArgs.defaultPenalty,
            taskArgs.penaltyRateWad,
            taskArgs.tranchesCount,
            taskArgs.trancheAPRsWads.split(',').map(Number),
            taskArgs.trancheBoostedAPRsWads.split(',').map(Number),
            taskArgs.trancheBoostRatios.split(',').map(Number),
            taskArgs.trancheCoveragesWads.split(',').map(Number)
        ];

        const fundingSplitWads = taskArgs.fundingSplitWads;

        const initData = ethers.utils.defaultAbiCoder.encode(
            [
                'tuple(string name, string token, address stableCoinContractAddress, address platformTokenContractAddress, uint minFundingCapacity, uint maxFundingCapacity, uint64 fundingPeriodSeconds, uint64 lendingTermSeconds, address borrowerAddress, uint firstLossAssets, uint borrowerTotalInterestRateWad, uint repaymentRecurrenceDays, uint gracePeriodDays, uint protocolFeeWad, uint defaultPenalty, uint penaltyRateWad, uint8 tranchesCount, uint[] trancheAPRsWads, uint[] trancheBoostedAPRsWads, uint[] trancheBoostRatios, uint[] trancheCoveragesWads)',
                'uint[]',
            ],
            [LendingPoolParams, fundingSplitWads]
        );

        console.log("msg.data:", initData);
    });
