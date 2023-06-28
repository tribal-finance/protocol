// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./LendingPool.sol";

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

    function poolBalanceThreshold(
        uint borrowedAssets,
        uint borrowerTotalInterestRateWad,
        uint repaymentRecurrenceDays,
        uint gracePeriodDays,
        uint firstLossAssets
    ) public pure returns (uint) {
        uint dailyBorrowerInterestAmount = (borrowedAssets * borrowerTotalInterestRateWad) / WAD / 365;
        uint interestGoDownAmount = (repaymentRecurrenceDays + gracePeriodDays) * dailyBorrowerInterestAmount;
        if (interestGoDownAmount > firstLossAssets) {
            return 0;
        }
        return firstLossAssets - interestGoDownAmount;
    }

    function poolBalance(
        uint firstLossAssets,
        uint borrowerInterestRepaid,
        uint allLendersInterestByDate
    ) public pure returns (uint) {
        uint positiveBalance = firstLossAssets + borrowerInterestRepaid;
        if (allLendersInterestByDate > positiveBalance) {
            return 0;
        }
        return positiveBalance - allLendersInterestByDate;
    }

    function borrowerPenaltyAmount(
        uint poolBalance,
        uint poolBalanceThreshold,
        uint collectedAssets,
        uint allLendersEffectiveAprWad,
        uint penaltyRateWad
    ) public pure returns (uint) {
        if (poolBalance >= poolBalanceThreshold) {
            return 0;
        }

        uint dailyLendersInterestAmount = (collectedAssets * allLendersEffectiveAprWad) / WAD / 365;
        uint balanceDifference = poolBalanceThreshold - poolBalance;
        uint daysDelinquent = balanceDifference / dailyLendersInterestAmount;

        if (daysDelinquent == 0) {
            return 0;
        }

        uint penaltyCoefficientWad = _wadPow(WAD + penaltyRateWad, daysDelinquent);

        uint penalty = (balanceDifference * penaltyCoefficientWad) / WAD - balanceDifference;
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

    function borrowerExcessSpread(
        uint borrowerInterestRepaid,
        uint allLendersInterest,
        uint borrowerExpectedInterest,
        uint protocolFeeWad
    ) public pure returns (uint) {
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
        uint stakedAssets,
        uint lockedPlatformTokens,
        uint trancheBoostRatio,
        uint trancheAPRWad,
        uint trancheBoostedAPRWad
    ) public pure returns (uint) {
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
        uint lenderDepositedAssets, 
        uint lenderEffectiveApr, 
        uint fundedAt, 
        uint lendingTermSeconds
    ) public view returns (uint) {
        if (fundedAt > block.timestamp) {
            return 0;
        }
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

    function lenderTotalAprWad(
        uint[] memory lenderEffectiveAprs, 
        uint[] memory stakedAssets
    ) public pure returns (uint) {
        uint weightedApysWad = 0;
        uint totalAssets = 0;
        for (uint8 i; i < lenderEffectiveAprs.length; ++i) {
            totalAssets += stakedAssets[i];
            weightedApysWad += (lenderEffectiveAprs[i] * stakedAssets[i]);
        }

        if (totalAssets == 0) {
            return 0;
        }

        return weightedApysWad / totalAssets;
    }


    function allLendersEffectiveAprWad(
        LendingPool lendingPool,
        uint256 tranchesCount
    ) public view returns (uint) {
        uint weightedSum = 0;
        uint totalStakedAssets = 0;
        for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
            uint stakedAssets = lendingPool.s_totalStakedAssetsByTranche(trancheId);
            totalStakedAssets += stakedAssets;

            uint boostedAssets = lendingPool.s_totalLockedPlatformTokensByTranche(trancheId) / lendingPool.trancheBoostRatios(trancheId);
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
        if (lendingPool.fundedAt() == 0 || block.timestamp <= lendingPool.fundedAt()) {
            return 0;
        }
        uint time = block.timestamp < lendingPool.fundedAt() + lendingPool.lendingTermSeconds() ? block.timestamp : lendingPool.fundedAt() + lendingPool.lendingTermSeconds();
        uint elapsedTime = time - lendingPool.fundedAt();
        return (lendingPool.allLendersInterest() * elapsedTime) / lendingPool.lendingTermSeconds();
    }
}