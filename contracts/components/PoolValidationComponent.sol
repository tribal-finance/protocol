// SPDX-License-Identifier: MIT

import "./Component.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";
import "../utils/Identifiers.sol";

pragma solidity 0.8.18;

contract PoolValidationComponent is Component {

    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public initializer {
        _initialize(_instanceId, Identifiers.POOL_VALIDATION_COMPONENT, _poolStorage);
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
        require(TribalGovernance(_authorityAddress).isWhitelistedBorrower(params.borrowerAddress), "LP023");
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
}