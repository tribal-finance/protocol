// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

library PoolCalculations {
    uint constant WAD = 10**18;
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

    function poolBalanceThreshold(uint borrowedAssets, uint borrowerTotalInterestRateWad, uint repaymentRecurrenceDays, uint gracePeriodDays, uint firstLossAssets) public pure returns (uint) {
        uint dailyBorrowerInterestAmount = (borrowedAssets * borrowerTotalInterestRateWad) / WAD / 365;
        uint interestGoDownAmount = (repaymentRecurrenceDays + gracePeriodDays) * dailyBorrowerInterestAmount;
        if (interestGoDownAmount > firstLossAssets) {
            return 0;
        }
        return firstLossAssets - interestGoDownAmount;
    }

    function poolBalance(uint firstLossAssets, uint borrowerInterestRepaid, uint allLendersInterestByDate) public pure returns (uint) {
        uint positiveBalance = firstLossAssets + borrowerInterestRepaid;
        if (allLendersInterestByDate > positiveBalance) {
            return 0;
        }
        return positiveBalance - allLendersInterestByDate;
    }

    function borrowerPenaltyAmount(uint poolBalance, uint poolBalanceThreshold, uint collectedAssets, uint allLendersEffectiveAprWad, uint penaltyRateWad) public pure returns (uint) {
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

    function borrowerExpectedInterest(uint collectedAssets, uint borrowerAdjustedInterestRateWad) public pure returns (uint) {
        return (collectedAssets * borrowerAdjustedInterestRateWad) / WAD;
    }
}