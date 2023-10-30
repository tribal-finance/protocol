// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./LendingPool.sol";
import "../vaults/TrancheVault.sol";
import "../authority/Authority.sol";
import "hardhat/console.sol";

library PoolCalculations {
    uint constant WAD = 10 ** 18;
    uint constant YEAR = 365 days;

    function _wadPow(uint _xWad, uint _n) internal pure returns (uint) {
        uint xWad = _xWad;
        uint n = _n;
        uint result = n % 2 != 0 ? xWad : WAD;

        for (n /= 2; n != 0; n /= 2) {
            xWad = (xWad * xWad) / WAD;

            if (n % 2 != 0) {
                result = (result * xWad) / WAD;
            }
        }

        return result;
    }

    function poolBalanceThreshold(LendingPool lendingPool) public view returns (uint) {
        uint borrowedAssets = lendingPool.borrowedAssets();
        console.log("pdt Borrowed assets is:", borrowedAssets);

        uint borrowerTotalInterestRateWad = lendingPool.borrowerTotalInterestRateWad();
        console.log("pdt Borrower total interest rate (in WAD) is:", borrowerTotalInterestRateWad);

        uint repaymentRecurrenceDays = lendingPool.repaymentRecurrenceDays();
        console.log("pdt Repayment recurrence days is:", repaymentRecurrenceDays);

        uint gracePeriodDays = lendingPool.gracePeriodDays();
        console.log("pdt Grace period days is:", gracePeriodDays);

        uint firstLossAssets = lendingPool.firstLossAssets();
        console.log("pdt First loss assets is:", firstLossAssets);

        uint dailyBorrowerInterestAmount = (borrowedAssets * borrowerTotalInterestRateWad) / WAD / 365;
        console.log("pdt Daily borrower interest amount is:", dailyBorrowerInterestAmount);

        uint interestGoDownAmount = (repaymentRecurrenceDays + gracePeriodDays) * dailyBorrowerInterestAmount;
        console.log("pdt Interest go-down amount is:", interestGoDownAmount);

        if (interestGoDownAmount > firstLossAssets) {
            console.log("pdt Interest go-down amount is greater than first loss assets, returning 0");
            return 0;
        }

        uint threshold = firstLossAssets - interestGoDownAmount;
        console.log("pdt Computed pool balance threshold is:", threshold);

        return threshold;
    }

    function poolBalance(LendingPool lendingPool) public view returns (uint) {
        uint firstLossAssets = lendingPool.firstLossAssets();
        uint borrowerInterestRepaid = lendingPool.borrowerInterestRepaid();
        uint allLendersInterestByDate = lendingPool.allLendersInterestByDate();

        uint positiveBalance = firstLossAssets + borrowerInterestRepaid;
        if (allLendersInterestByDate > positiveBalance) {
            return 0;
        }
        return positiveBalance - allLendersInterestByDate;
    }

    function borrowerPenaltyAmount(LendingPool lendingPool) public view returns (uint) {
        uint poolBalance = lendingPool.poolBalance();
        console.log("Pool balance is:", poolBalance);

        uint poolBalanceThreshold = lendingPool.poolBalanceThreshold();
        console.log("Pool balance threshold is:", poolBalanceThreshold);

        uint collectedAssets = lendingPool.collectedAssets();
        console.log("Collected assets is:", collectedAssets);

        uint allLendersEffectiveAprWad = lendingPool.allLendersEffectiveAprWad();
        console.log("All lenders effective APR (in WAD) is:", allLendersEffectiveAprWad);

        uint penaltyRateWad = lendingPool.penaltyRateWad();
        console.log("Penalty rate (in WAD) is:", penaltyRateWad);

        if (poolBalance >= poolBalanceThreshold) {
            console.log("Pool balance is greater than or equal to the threshold, returning 0");
            console.log("Pool balance:", poolBalance);
            console.log("Pool balance thresh:", poolBalanceThreshold);
            return 0;
        }

        uint dailyLendersInterestAmount = (collectedAssets * allLendersEffectiveAprWad) / WAD / 365;
        console.log("Daily lenders interest amount is:", dailyLendersInterestAmount);

        uint balanceDifference = poolBalanceThreshold - poolBalance;
        console.log("Balance difference is:", balanceDifference);

        uint daysDelinquent = balanceDifference / dailyLendersInterestAmount;
        console.log("Days delinquent is:", daysDelinquent);

        if (daysDelinquent == 0) {
            console.log("Days delinquent is 0, returning 0");
            return 0;
        }

        uint penaltyCoefficientWad = _wadPow(WAD + penaltyRateWad, daysDelinquent);
        console.log("Penalty coefficient (in WAD) is:", penaltyCoefficientWad);

        uint penalty = (balanceDifference * penaltyCoefficientWad) / WAD - balanceDifference;
        console.log("Penalty is:", penalty);

        return penalty;
    }

    function borrowerExpectedInterest(
        uint collectedAssets,
        uint borrowerAdjustedInterestRateWad
    ) public pure returns (uint) {
        return (collectedAssets * borrowerAdjustedInterestRateWad) / WAD;
    }

    function borrowerOutstandingInterest(
        uint borrowerInterestRepaid,
        uint borrowerExpectedInterest
    ) public pure returns (uint) {
        if (borrowerInterestRepaid > borrowerExpectedInterest) {
            return 0;
        }
        return borrowerExpectedInterest - borrowerInterestRepaid;
    }

    function borrowerExcessSpread(LendingPool lendingPool) public view returns (uint) {
        uint borrowerInterestRepaid = lendingPool.borrowerInterestRepaid();
        uint allLendersInterest = lendingPool.allLendersInterest();
        uint borrowerExpectedInterest = lendingPool.borrowerExpectedInterest();
        uint protocolFeeWad = lendingPool.protocolFeeWad();

        if (borrowerOutstandingInterest(borrowerInterestRepaid, borrowerExpectedInterest) > 0) {
            return 0;
        }
        uint fees = (borrowerExpectedInterest * protocolFeeWad) / WAD;
        return borrowerInterestRepaid - allLendersInterest - fees;
    }

    function borrowerAdjustedInterestRateWad(
        uint borrowerTotalInterestRateWad,
        uint lendingTermSeconds
    ) public pure returns (uint adj) {
        return (borrowerTotalInterestRateWad * lendingTermSeconds) / YEAR;
    }

    function lenderEffectiveAprByTrancheWad(
        LendingPool lendingPool,
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        uint stakedAssets = lendingPool.lenderStakedTokensByTranche(lenderAddress, trancheId);
        uint lockedPlatformTokens = lendingPool.lenderPlatformTokensByTrancheLocked(lenderAddress, trancheId);
        uint trancheBoostRatio = lendingPool.trancheBoostRatios(trancheId);
        uint trancheAPRWad = lendingPool.trancheAPRsWads(trancheId);
        uint trancheBoostedAPRWad = lendingPool.trancheBoostedAPRsWads(trancheId);

        if (stakedAssets == 0) {
            return 0;
        }
        uint boostedAssets = lockedPlatformTokens / trancheBoostRatio;
        if (boostedAssets > stakedAssets) {
            boostedAssets = stakedAssets;
        }
        uint unBoostedAssets = stakedAssets - boostedAssets;
        uint weightedAverage = (unBoostedAssets * trancheAPRWad + boostedAssets * trancheBoostedAPRWad) / stakedAssets;
        return weightedAverage;
    }

    function lenderRewardsByTrancheGeneratedByDate(
        LendingPool lendingPool,
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        uint fundedAt = lendingPool.fundedAt();
        if (fundedAt == 0) {
            return 0;
        }
        uint lenderDepositedAssets = lendingPool.lenderDepositedAssetsByTranche(lenderAddress, trancheId);
        uint lenderEffectiveApr = lendingPool.lenderEffectiveAprByTrancheWad(lenderAddress, trancheId);
        uint lendingTermSeconds = lendingPool.lendingTermSeconds();

        uint secondsElapsed = block.timestamp - fundedAt;
        if (secondsElapsed > lendingTermSeconds) {
            secondsElapsed = lendingTermSeconds;
        }
        return (lenderDepositedAssets * lenderEffectiveApr * secondsElapsed) / (YEAR * WAD);
    }

    function lenderTotalExpectedRewardsByTranche(
        uint lenderDepositedAssets,
        uint lenderEffectiveApr,
        uint lendingTermSeconds
    ) public pure returns (uint) {
        return (lenderDepositedAssets * lenderEffectiveApr * lendingTermSeconds) / (YEAR * WAD);
    }

    function lenderTotalAprWad(LendingPool lendingPool, address lenderAddress) public view returns (uint) {
        uint256 tranchesCount = lendingPool.tranchesCount();

        uint weightedApysWad = 0;
        uint totalAssets = 0;
        for (uint8 i; i < tranchesCount; i++) {
            uint staked = lendingPool.lenderStakedTokensByTranche(lenderAddress, i);
            totalAssets += staked;
            weightedApysWad += (lendingPool.lenderEffectiveAprByTrancheWad(lenderAddress, i) * staked);
        }

        if (totalAssets == 0) {
            return 0;
        }

        return weightedApysWad / totalAssets;
    }

    function allLendersEffectiveAprWad(LendingPool lendingPool, uint256 tranchesCount) public view returns (uint) {
        uint weightedSum = 0;
        uint totalStakedAssets = 0;
        for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
            uint stakedAssets = lendingPool.s_totalStakedAssetsByTranche(trancheId);
            totalStakedAssets += stakedAssets;

            uint boostedAssets = lendingPool.s_totalLockedPlatformTokensByTranche(trancheId) /
                lendingPool.trancheBoostRatios(trancheId);
            if (boostedAssets > stakedAssets) {
                boostedAssets = stakedAssets;
            }
            uint unBoostedAssets = stakedAssets - boostedAssets;

            weightedSum += unBoostedAssets * lendingPool.trancheAPRsWads(trancheId);
            weightedSum += boostedAssets * lendingPool.trancheBoostedAPRsWads(trancheId);
        }

        return weightedSum / totalStakedAssets;
    }

    function allLendersInterestByDate(LendingPool lendingPool) public view returns (uint) {
        uint256 fundedAt = lendingPool.fundedAt();
        uint256 lendingTermSeconds = lendingPool.lendingTermSeconds();
        if (fundedAt == 0 || block.timestamp <= fundedAt) {
            return 0;
        }
        uint time = block.timestamp < fundedAt + lendingTermSeconds ? block.timestamp : fundedAt + lendingTermSeconds;
        uint elapsedTime = time - fundedAt;
        return (lendingPool.allLendersInterest() * elapsedTime) / lendingTermSeconds;
    }

    function trancheVaultContracts(LendingPool lendingPool) public view returns (TrancheVault[] memory contracts) {
        uint256 trancheCount = lendingPool.tranchesCount();
        contracts = new TrancheVault[](trancheCount);

        for (uint i; i < contracts.length; ++i) {
            contracts[i] = TrancheVault(lendingPool.trancheVaultAddresses(i));
        }
    }

    function validateInitParams(
        LendingPool.LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    ) public view {
        require(params.stableCoinContractAddress != address(0), "LP005"); // "LendingPool: stableCoinContractAddress empty"

        require(params.minFundingCapacity > 0, "LP006"); // "LendingPool: minFundingCapacity == 0"
        require(params.maxFundingCapacity > 0, "LP007"); // "LendingPool: maxFundingCapacity == 0"
        require(
            params.maxFundingCapacity >= params.minFundingCapacity,
            "LP008" // "LendingPool: maxFundingCapacity < minFundingCapacity"
        );

        require(params.fundingPeriodSeconds > 0, "LP009"); // "LendingPool: fundingPeriodSeconds == 0"
        require(params.lendingTermSeconds > 0, "LP010"); // "LendingPool: lendingTermSeconds == 0"
        require(params.borrowerAddress != address(0), "LP011"); // "LendingPool: borrowerAddress empty"
        require(Authority(_authorityAddress).isWhitelistedBorrower(params.borrowerAddress), "LP023");
        require(params.borrowerTotalInterestRateWad > 0, "LP012"); // "LendingPool: borrower interest rate = 0%"
        require(params.protocolFeeWad > 0, "LP013"); // "LendingPool: protocolFee == 0%"
        require(params.penaltyRateWad > 0, "LP014"); // "LendingPool: penaltyRate == 0"

        require(params.tranchesCount > 0, "LP015"); // "LendingPool: tranchesCount == 0"
        require(_trancheVaultAddresses.length == params.tranchesCount, "LP016"); // "LendingPool: trancheAddresses length"
        require(params.trancheAPRsWads.length == params.tranchesCount, "LP017"); // "LP001");// "LendingPool: tranche APRs length"
        require(
            params.trancheBoostedAPRsWads.length == params.tranchesCount,
            "LP018" // "LendingPool: tranche Boosted APRs length"
        );
        require(
            params.trancheBoostedAPRsWads.length == params.tranchesCount,
            "LP019" // "LendingPool: tranche Coverage APRs length"
        );

        for (uint i; i < params.tranchesCount; ++i) {
            require(params.trancheAPRsWads[i] > 0, "tranche APRs == 0");
            require(
                params.trancheBoostedAPRsWads[i] >= params.trancheAPRsWads[i],
                "LP020" // "LendingPool: tranche boosted APRs < tranche APRs"
            );
        }

        require(_feeSharingContractAddress != address(0), "LP021"); // "LendingPool: feeSharingAddress empty"
        require(_authorityAddress != address(0), "LP022"); // "LendingPool: authorityAddress empty"
    }

    function validateWad(uint256[] memory ints) external pure {
        for (uint256 i = 0; i < ints.length; i++) {
            require(ints[i] <= 1e18, "LP024 - bad wad");
        }
    }

    function setInitializer(
        LendingPool.LendingPoolParams calldata params,
        string storage name,
        string storage token,
        uint[] storage trancheAPRsWads,
        uint[] storage trancheBoostedAPRsWads,
        uint[] storage trancheBoostRatios,
        uint[] storage trancheCoveragesWads
    ) public {
        bytes memory nameBytes = bytes(params.name);
        bytes memory tokenBytes = bytes(params.token);

        for (uint i = 0; i < nameBytes.length; i++) {
            bytes(name)[i] = nameBytes[i];
        }

        for (uint i = 0; i < tokenBytes.length; i++) {
            bytes(token)[i] = tokenBytes[i];
        }

        for (uint i = 0; i < params.trancheAPRsWads.length; i++) {
            trancheAPRsWads[i] = params.trancheAPRsWads[i];
        }

        for (uint i = 0; i < params.trancheBoostedAPRsWads.length; i++) {
            trancheBoostedAPRsWads[i] = params.trancheBoostedAPRsWads[i];
        }

        for (uint i = 0; i < params.trancheBoostRatios.length; i++) {
            trancheBoostRatios[i] = params.trancheBoostRatios[i];
        }

        for (uint i = 0; i < params.trancheCoveragesWads.length; i++) {
            trancheCoveragesWads[i] = params.trancheCoveragesWads[i];
        }
    }
}
