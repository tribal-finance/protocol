// SPDX-License-Identifier: MIT

import "./Component.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";
import "../utils/Identifiers.sol";

pragma solidity 0.8.18;

contract PoolCalculationsComponent is Component {
    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public override initializer {
        _initialize(_instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT, _poolStorage);
    }

    /** @notice Returns amount of stablecoins to be paid for the lender by the end of the pool term.
     *  `lenderAPR * lenderDepositedAssets * lendingTermSeconds / YEAR`
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderTotalExpectedRewardsByTranche(address lenderAddress, uint8 trancheId) public view returns (uint) {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));

        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint256 lendingTermSeconds = poolStorage.getUint256(instanceId, "lendingTermSeconds");

        return
            pcc.lenderTotalExpectedRewardsByTranche(
                pcc.lenderDepositedAssetsByTranche(lenderAddress, trancheId),
                pcc.lenderEffectiveAprByTrancheWad(lenderAddress, trancheId),
                lendingTermSeconds
            );
    }

    function lenderEffectiveAprByTrancheWad(address lenderAddress, uint8 trancheId) public view returns (uint) {
        // uint stakedAssets = lendingPool.lenderStakedTokensByTranche(lenderAddress, trancheId);
        bytes memory rawData = poolStorage.getMappingUint256AddressToBytes(
            instanceId,
            "lenderStakedTokensByTranche",
            trancheId,
            lenderAddress
        );
        Constants.Rewardable memory rewardData = abi.decode(rawData, (Constants.Rewardable));
        uint256 stakedAssets = rewardData.stakedAssets;
        //uint lockedPlatformTokens = lendingPool.lenderPlatformTokensByTrancheLocked(lenderAddress, trancheId);
        uint256 lockedPlatformTokens = rewardData.lockedPlatformTokens;

        // uint trancheBoostRatio = lendingPool.trancheBoostRatios(trancheId);
        uint256 trancheBoostRatio = poolStorage.getArrayUint256(instanceId, "trancheBoostRatios", trancheId);
        // uint trancheAPRWad = lendingPool.trancheAPRsWads(trancheId);
        uint256 trancheAPRWad = poolStorage.getArrayUint256(instanceId, "trancheAPRsWads", trancheId);

        //uint trancheBoostedAPRWad = lendingPool.trancheBoostedAPRsWads(trancheId);
        uint256 trancheBoostedAPRWad = poolStorage.getArrayUint256(instanceId, "trancheBoostedAPRsWads", trancheId);

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

    function lenderRewardsByTrancheGeneratedByDate(address lenderAddress, uint8 trancheId) public view returns (uint) {
        // uint fundedAt = lendingPool.fundedAt();
        uint fundedAt = poolStorage.getUint256(instanceId, "fundedAt");
        if (fundedAt == 0) {
            return 0;
        }

        // uint lenderDepositedAssets = lendingPool.lenderDepositedAssetsByTranche(lenderAddress, trancheId);
        bytes memory rawDataDeposited = poolStorage.getMappingUint256AddressToBytes(
            instanceId,
            "lenderDepositedAssetsByTranche",
            trancheId,
            lenderAddress
        );
        uint lenderDepositedAssets = abi.decode(rawDataDeposited, (uint));

        // uint lenderEffectiveApr = lendingPool.lenderEffectiveAprByTrancheWad(lenderAddress, trancheId);
        // Assuming that the APR calculation remains internal to the contract, otherwise you'd retrieve it similarly from storage.
        uint lenderEffectiveApr = lenderEffectiveAprByTrancheWad(lenderAddress, trancheId);

        // uint lendingTermSeconds = lendingPool.lendingTermSeconds();
        uint lendingTermSeconds = poolStorage.getUint256(instanceId, "lendingTermSeconds");

        uint secondsElapsed = block.timestamp - fundedAt;
        if (secondsElapsed > lendingTermSeconds) {
            secondsElapsed = lendingTermSeconds;
        }

        // Assuming YEAR and WAD are constants or stored values that can be retrieved or known at compile time.
        return (lenderDepositedAssets * lenderEffectiveApr * secondsElapsed) / (Constants.YEAR * Constants.WAD);
    }

    function allLendersEffectiveAprWad(uint256 tranchesCount) public view returns (uint) {
        uint weightedSum = 0;
        uint totalStakedAssets = 0;

        for (uint8 trancheId = 0; trancheId < tranchesCount; trancheId++) {
            // Retrieve total staked assets by tranche from poolStorage
            uint stakedAssets = poolStorage.getArrayUint256(instanceId, "s_totalStakedAssetsByTranche", trancheId);
            totalStakedAssets += stakedAssets;

            // Retrieve and calculate total locked platform tokens by tranche and tranche boost ratio
            uint256 lockedPlatformTokens = poolStorage.getArrayUint256(
                instanceId,
                "s_totalLockedPlatformTokensByTranche",
                trancheId
            );
            uint trancheBoostRatio = poolStorage.getArrayUint256(instanceId, "trancheBoostRatios", trancheId);
            uint boostedAssets = lockedPlatformTokens / trancheBoostRatio;
            if (boostedAssets > stakedAssets) {
                boostedAssets = stakedAssets;
            }

            uint unBoostedAssets = stakedAssets - boostedAssets;

            // Retrieve tranche APRs and boosted APRs from poolStorage
            uint trancheAPRWad = poolStorage.getArrayUint256(instanceId, "trancheAPRsWads", trancheId);
            uint trancheBoostedAPRWad = poolStorage.getArrayUint256(instanceId, "trancheBoostedAPRsWads", trancheId);

            weightedSum += unBoostedAssets * trancheAPRWad;
            weightedSum += boostedAssets * trancheBoostedAPRWad;
        }

        if (totalStakedAssets == 0) {
            return 0;
        }

        return weightedSum / totalStakedAssets;
    }

    function allLendersEffectiveAprWad() public view returns (uint256) {
        return allLendersEffectiveAprWad(poolStorage.getUint256(instanceId, "tranchesCount"));
    }

    function poolBalance() public view returns (uint) {
        uint firstLossAssets = poolStorage.getUint256(instanceId, "firstLossAssets");
        uint borrowerInterestRepaid = poolStorage.getUint256(instanceId, "borrowerInterestRepaid");
        uint allLendersInterestByDate = allLendersInterestByDate();

        uint positiveBalance = firstLossAssets + borrowerInterestRepaid;
        if (allLendersInterestByDate > positiveBalance) {
            return 0;
        }
        return positiveBalance - allLendersInterestByDate;
    }

    function poolBalanceThreshold() public view returns (uint) {
        uint borrowedAssets = poolStorage.getUint256(instanceId, "borrowedAssets");
        uint borrowerTotalInterestRateWad = poolStorage.getUint256(instanceId, "borrowerTotalInterestRateWad");
        uint repaymentRecurrenceDays = poolStorage.getUint256(instanceId, "repaymentRecurrenceDays");
        uint gracePeriodDays = poolStorage.getUint256(instanceId, "gracePeriodDays");
        uint firstLossAssets = poolStorage.getUint256(instanceId, "firstLossAssets");

        uint dailyBorrowerInterestAmount = (borrowedAssets * borrowerTotalInterestRateWad) / Constants.WAD / 365;
        uint interestGoDownAmount = (repaymentRecurrenceDays + gracePeriodDays) * dailyBorrowerInterestAmount;
        if (interestGoDownAmount > firstLossAssets) {
            return 0;
        }
        return firstLossAssets - interestGoDownAmount;
    }

    function borrowerPenaltyAmount() public view returns (uint) {
        uint poolBalance = poolBalance();
        uint poolBalanceThreshold = poolBalanceThreshold();
        uint collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        uint allLendersEffectiveAprWad = allLendersEffectiveAprWad();
        uint penaltyRateWad = poolStorage.getUint256(instanceId, "penaltyRateWad");

        if (poolBalance >= poolBalanceThreshold) {
            return 0;
        }

        uint dailyLendersInterestAmount = (collectedAssets * allLendersEffectiveAprWad) / Constants.WAD / 365;
        uint balanceDifference = poolBalanceThreshold - poolBalance;
        uint daysDelinquent = balanceDifference / dailyLendersInterestAmount;

        if (daysDelinquent == 0) {
            return 0;
        }

        uint penaltyCoefficientWad = Operations.wadPow(Constants.WAD + penaltyRateWad, daysDelinquent);

        uint penalty = (balanceDifference * penaltyCoefficientWad) / Constants.WAD - balanceDifference;
        return penalty;
    }

    function allLendersInterest() public view returns (uint256) {
        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        uint256 allLendersAprWad = allLendersEffectiveAprWad(tranchesCount);
        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        uint256 lendingTermSeconds = poolStorage.getUint256(instanceId, "lendingTermSeconds");

        // Make sure that WAD and YEAR are defined or retrieved correctly
        // uint WAD = getWadValue(); // if WAD is not a global constant
        // uint YEAR = getYearValue(); // if YEAR is not a global constant

        return (((allLendersAprWad * collectedAssets) / Constants.WAD) * lendingTermSeconds) / Constants.YEAR;
    }

    function allLendersInterestByDate() public view returns (uint) {
        uint256 fundedAt = poolStorage.getUint256(instanceId, "fundedAt");
        uint256 lendingTermSeconds = poolStorage.getUint256(instanceId, "lendingTermSeconds");
        if (fundedAt == 0 || block.timestamp <= fundedAt) {
            return 0;
        }
        uint time = block.timestamp < fundedAt + lendingTermSeconds ? block.timestamp : fundedAt + lendingTermSeconds;
        uint elapsedTime = time - fundedAt;

        // Retrieve all lenders' interest from poolStorage
        return (allLendersInterest() * elapsedTime) / lendingTermSeconds;
    }

    function trancheVaultContracts() public view returns (TrancheVault[] memory contracts) {
        uint256 trancheCount = poolStorage.getUint256(instanceId, "tranchesCount");
        contracts = new TrancheVault[](trancheCount);

        for (uint i = 0; i < trancheCount; ++i) {
            address trancheVaultAddress = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            contracts[i] = TrancheVault(trancheVaultAddress);
        }
    }

    function setInitializer(Constants.LendingPoolParams calldata params) public {
        poolStorage.setString(instanceId, "name", params.name);
        poolStorage.setString(instanceId, "token", params.token);

        // Tranche APRs, Boosted APRs, Boost Ratios, and Coverages are arrays of uint256
        for (uint i = 0; i < params.trancheAPRsWads.length; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheAPRsWads", i, params.trancheAPRsWads[i]);
        }

        for (uint i = 0; i < params.trancheBoostedAPRsWads.length; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheBoostedAPRsWads", i, params.trancheBoostedAPRsWads[i]);
        }

        for (uint i = 0; i < params.trancheBoostRatios.length; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheBoostRatios", i, params.trancheBoostRatios[i]);
        }

        for (uint i = 0; i < params.trancheCoveragesWads.length; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheCoveragesWads", i, params.trancheCoveragesWads[i]);
        }
    }

    /** @notice Returns amount of stablecoin rewards that has been withdrawn by the lender.
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderRewardsByTrancheRedeemed(address lenderAddress, uint8 trancheId) public view returns (uint256) {
        Constants.Rewardable memory rewardable = abi.decode(
            poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lenderAddress),
            (Constants.Rewardable)
        );
        return rewardable.redeemedRewards;
    }

    /** @notice Returns amount of stablecoin rewards that can be withdrawn by the lender. (generated - redeemed). Special means this one is distinguished from the FE version and is only used within the SCs
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderRewardsByTrancheRedeemable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        uint256 willReward = lenderRewardsByTrancheGeneratedByDate(lenderAddress, trancheId);
        uint256 hasRewarded = lenderRewardsByTrancheRedeemed(lenderAddress, trancheId);
        return willReward - hasRewarded;
    }

    function lenderTotalExpectedRewardsByTranche(
        uint lenderDepositedAssets,
        uint lenderEffectiveApr,
        uint lendingTermSeconds
    ) public pure returns (uint256) {
        return (lenderDepositedAssets * lenderEffectiveApr * lendingTermSeconds) / (Constants.YEAR * Constants.WAD);
    }

    /** @notice Returns amount of platform tokens that lender can lock in order to boost their APR
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderPlatformTokensByTrancheLockable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        // Fetching Rewardable struct from poolStorage
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lenderAddress),
            (Constants.Rewardable)
        );

        // Fetching trancheBoostRatio for the given trancheId from poolStorage
        uint trancheBoostRatio = poolStorage.getArrayUint256(instanceId, "trancheBoostRatios", trancheId);

        uint maxLockablePlatformTokens = r.stakedAssets * trancheBoostRatio;
        return maxLockablePlatformTokens - r.lockedPlatformTokens;
    }

    function lenderDepositedAssetsByTranche(address lenderAddress, uint8 trancheId) public view returns (uint) {
        // Fetching Rewardable struct for the given trancheId and lenderAddress from poolStorage
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lenderAddress),
            (Constants.Rewardable)
        );

        // Returning the stakedAssets from the Rewardable struct
        return r.stakedAssets;
    }

    function borrowerAdjustedInterestRateWad(
        uint borrowerTotalInterestRateWad,
        uint lendingTermSeconds
    ) public pure returns (uint adj) {
        return (borrowerTotalInterestRateWad * lendingTermSeconds) / Constants.YEAR;
    }

    function borrowerAdjustedInterestRateWad() public view returns (uint adj) {
        return
            borrowerAdjustedInterestRateWad(
                poolStorage.getUint256(instanceId, "borrowerTotalInterestRateWad"),
                poolStorage.getUint256(instanceId, "lendingTermSeconds")
            );
    }

    function borrowerExpectedInterest(
        uint collectedAssets,
        uint borrowerAdjustedInterestRateWad
    ) public pure returns (uint) {
        return (collectedAssets * borrowerAdjustedInterestRateWad) / Constants.WAD;
    }

    function borrowerExpectedInterest() public view returns (uint256) {
        return
            borrowerExpectedInterest(
                poolStorage.getUint256(instanceId, "collectedAssets"),
                borrowerAdjustedInterestRateWad()
            );
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

    function borrowerOutstandingInterest() public view returns (uint) {
        return
            borrowerOutstandingInterest(
                poolStorage.getUint256(instanceId, "borrowerInterestRepaid"),
                borrowerExpectedInterest()
            );
    }
}
