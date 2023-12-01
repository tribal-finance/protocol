// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

library Constants {

    struct RollOverSetting {
        bool enabled;
        bool principal;
        bool rewards;
        bool platformTokens;
    }

    struct Rewardable {
        uint stakedAssets;
        uint lockedPlatformTokens;
        uint redeemedRewards;
        uint64 start;
    }

    struct LendingPoolParams {
        string name;
        string token;
        address stableCoinContractAddress;
        address platformTokenContractAddress;
        uint minFundingCapacity;
        uint maxFundingCapacity;
        uint64 fundingPeriodSeconds;
        uint64 lendingTermSeconds;
        address borrowerAddress;
        uint firstLossAssets;
        uint borrowerTotalInterestRateWad;
        uint repaymentRecurrenceDays;
        uint gracePeriodDays;
        uint protocolFeeWad;
        uint defaultPenalty;
        uint penaltyRateWad;
        uint8 tranchesCount;
        uint[] trancheAPRsWads;
        uint[] trancheBoostedAPRsWads;
        uint[] trancheBoostRatios;
        uint[] trancheCoveragesWads;
    }
    
    uint256 constant WAD = 10 ** 18;
    uint256 constant YEAR = 365 days;

    bytes32 constant internal POOL_STORAGE_READER = keccak256("POOL_STORAGE_READER");
    bytes32 constant internal POOL_STORAGE_WRITER = keccak256("POOL_STORAGE_WRITER");
    bytes32 constant internal DEPLOYER = keccak256("DEPLOYER");
    bytes32 constant internal ADMIN = keccak256("ADMIN");
    bytes32 constant internal OWNER = keccak256("OWNER");
    bytes32 constant internal LENDER = keccak256("LENDER");
    bytes32 constant internal BORROWER = keccak256("BORROWER");
    bytes32 constant internal PROTOCOL = keccak256("PROTOCOL");
    
}