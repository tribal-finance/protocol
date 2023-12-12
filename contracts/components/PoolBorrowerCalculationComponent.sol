// SPDX-License-Identifier: MIT

import "./Component.sol";
import "./PoolCalculationsComponent.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";
import "../utils/Identifiers.sol";
import "../factory/PoolFactory.sol";

pragma solidity 0.8.18;

contract PoolBorrowerCalculationComponent is Component {
    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public override initializer {
        _initialize(_instanceId, Identifiers.POOL_BORROWER_CALCULATIONS_COMPONENT, _poolStorage);
    }

    function borrowerPenaltyAmount() public view returns (uint) {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint poolBalance = pcc.poolBalance();
        uint poolBalanceThreshold = pcc.poolBalanceThreshold();
        uint collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        uint allLendersEffectiveAprWad = pcc.allLendersEffectiveAprWad();
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

    function borrowerExcessSpread() public view returns (uint) {

        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint borrowerInterestRepaid = poolStorage.getUint256(instanceId, "borrowerInterestRepaid");
        uint allLendersInterest = pcc.allLendersInterest();
        uint borrowerExpectedInterest = borrowerExpectedInterest();
        uint protocolFeeWad = poolStorage.getUint256(instanceId, "protocolFeeWad");

        if (borrowerOutstandingInterest(borrowerInterestRepaid, borrowerExpectedInterest) > 0) {
            return 0;
        }
        uint fees = (borrowerExpectedInterest * protocolFeeWad) / Constants.WAD;
        return borrowerInterestRepaid - allLendersInterest - fees;
    }
}
