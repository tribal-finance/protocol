// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/** @dev state variables + getters, setters and events for LendingPool
 */
abstract contract LendingPoolState {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*//////////////////////////////////////
      Initializer parameters
    //////////////////////////////////////*/

    string public name;
    string public token;
    address public stableCoinContractAddress;
    address public platformTokenContractAddress;
    uint public minFundingCapacity;
    uint public maxFundingCapacity;
    uint64 public fundingPeriodSeconds;
    uint64 public lendingTermSeconds;
    address public borrowerAddress;
    uint public firstLossAssets;
    uint public repaymentRecurrenceDays;
    uint public gracePeriodDays;
    uint public borrowerTotalInterestRateWad;
    uint public protocolFeeWad;
    uint public defaultPenalty;
    uint public penaltyRateWad;
    uint8 public tranchesCount;
    uint[] public trancheAPRsWads;
    uint[] public trancheBoostedAPRsWads;
    uint[] public trancheBoostRatios;
    uint[] public trancheCoveragesWads;

    /*//////////////////////////////////////
      Other contract addresses
    //////////////////////////////////////*/

    address public feeSharingContractAddress;
    address[] public trancheVaultAddresses;

    /*//////////////////////////////////////
      Some Timestamps
    //////////////////////////////////////*/
    /* openedAt */
    uint64 private s_openedAt;
    event ChangeOpenedAt(address indexed actor, uint64 oldValue, uint64 newValue);

    function openedAt() public view returns (uint64) {
        return s_openedAt;
    }

    function _setOpenedAt(uint64 newValue) internal {
        uint64 oldValue = s_openedAt;
        s_openedAt = newValue;
        emit ChangeOpenedAt(msg.sender, oldValue, newValue);
    }

    /* fundedAt */
    uint64 private s_fundedAt;
    event ChangeFundedAt(address indexed actor, uint64 oldValue, uint64 newValue);

    function fundedAt() public view returns (uint64) {
        return s_fundedAt;
    }

    function _setFundedAt(uint64 newValue) internal {
        uint64 oldValue = s_fundedAt;
        s_fundedAt = newValue;
        emit ChangeFundedAt(msg.sender, oldValue, newValue);
    }

    /* fundingFailedAt */
    uint64 private s_fundingFailedAt;
    event ChangeFundingFailedAt(address indexed actor, uint64 oldValue, uint64 newValue);

    function fundingFailedAt() public view returns (uint64) {
        return s_fundingFailedAt;
    }

    function _setFundingFailedAt(uint64 newValue) internal {
        uint64 oldValue = s_fundingFailedAt;
        s_fundingFailedAt = newValue;
        emit ChangeFundingFailedAt(msg.sender, oldValue, newValue);
    }

    /* flcDepositedAt */
    uint64 private s_flcDepositedAt;
    event ChangeFlcDepositedAt(address indexed actor, uint64 oldValue, uint64 newValue);

    function flcDepositedAt() public view returns (uint64) {
        return s_flcDepositedAt;
    }

    function _setFlcDepositedAt(uint64 newValue) internal {
        uint64 oldValue = s_flcDepositedAt;
        s_flcDepositedAt = newValue;
        emit ChangeFlcDepositedAt(msg.sender, oldValue, newValue);
    }

    /* borrowedAt */
    uint64 private s_borrowedAt;
    event ChangeBorrowedAt(address indexed actor, uint64 oldValue, uint64 newValue);

    function borrowedAt() public view returns (uint64) {
        return s_borrowedAt;
    }

    function _setBorrowedAt(uint64 newValue) internal {
        uint64 oldValue = s_borrowedAt;
        s_borrowedAt = newValue;
        emit ChangeBorrowedAt(msg.sender, oldValue, newValue);
    }

    /* repaidAt */
    uint64 private s_repaidAt;
    event ChangeRepaidAt(address indexed actor, uint64 oldValue, uint64 newValue);

    function repaidAt() public view returns (uint64) {
        return s_repaidAt;
    }

    function _setRepaidAt(uint64 newValue) internal {
        uint64 oldValue = s_repaidAt;
        s_repaidAt = newValue;
        emit ChangeRepaidAt(msg.sender, oldValue, newValue);
    }

    /* delinquentAt */
    uint64 private s_delinquentAt;
    event ChangeDelinquentAt(address indexed actor, uint64 oldValue, uint64 newValue);
    function delinquentAt() public view returns (uint64) { return s_delinquentAt; }
    function _setDelinquentAt(uint64 newValue) internal {
        uint64 oldValue = s_delinquentAt;
        s_delinquentAt = newValue;
        emit ChangeDelinquentAt(msg.sender, oldValue, newValue);
    }

    /*//////////////////////////////////////
      Interests & Yields
    //////////////////////////////////////*/
    uint private s_collectedAssets;
    event ChangeCollectedAssets(address indexed actor, uint oldValue, uint newValue);

    function collectedAssets() public view returns (uint) {
        return s_collectedAssets;
    }

    function _setCollectedAssets(uint newValue) internal {
        uint oldValue = s_collectedAssets;
        s_collectedAssets = newValue;
        emit ChangeCollectedAssets(msg.sender, oldValue, newValue);
    }

    /* borrowedAssets */
    uint private s_borrowedAssets;
    event ChangeBorrowedAssets(address indexed actor, uint oldValue, uint newValue);

    function borrowedAssets() public view returns (uint) {
        return s_borrowedAssets;
    }

    function _setBorrowedAssets(uint newValue) internal {
        uint oldValue = s_borrowedAssets;
        s_borrowedAssets = newValue;
        emit ChangeBorrowedAssets(msg.sender, oldValue, newValue);
    }

    /* borrowerInterestRepaid */
    uint private s_borrowerInterestRepaid;
    event ChangeBorrowerInterestRepaid(address indexed actor, uint oldValue, uint newValue);

    function borrowerInterestRepaid() public view returns (uint) {
        return s_borrowerInterestRepaid;
    }

    function _setBorrowerInterestRepaid(uint newValue) internal {
        uint oldValue = s_borrowerInterestRepaid;
        s_borrowerInterestRepaid = newValue;
        emit ChangeBorrowerInterestRepaid(msg.sender, oldValue, newValue);
    }

    struct Rewardable {
        uint stakedAssets;
        uint lockedPlatformTokens;
        uint redeemedRewards;
        uint64 start;
    }

    EnumerableSet.AddressSet internal s_lenders;

    /// @dev trancheId => (lenderAddress => RewardableRecord)
    mapping(uint8 => mapping(address => Rewardable)) internal s_trancheRewardables;

    /// @dev trancheId => stakedassets
    mapping(uint8 => uint256) internal s_totalStakedAssetsByTranche;

    /// @dev trancheId => lockedTokens
    mapping(uint8 => uint256) internal s_totalLockedPlatformTokensByTranche;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
