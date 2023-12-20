// SPDX-License-Identifier: MIT

import "../utils/Constants.sol";
import "../storage/PoolStorage.sol";

pragma solidity 0.8.18;

abstract contract PoolEvents {
    /*///////////////////////////////////
       EVENTS
    ///////////////////////////////////*/

    // State Changes //
    event PoolInitialized(
        Constants.LendingPoolParams params,
        address[] _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    );
    event PoolOpen(uint256 openedAt);
    event PoolFunded(uint256 fundedAt, uint collectedAssets);
    event PoolFundingFailed(uint256 fundingFailedAt);
    event PoolRepaid(uint256 repaidAt);
    event PoolDefaulted(uint256 defaultedAt);
    event PoolFirstLossCapitalWithdrawn(uint64 flcWithdrawntAt);

    // Lender //
    event LenderDeposit(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderWithdraw(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderWithdrawInterest(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderTrancheRewardsChange(
        address indexed lender,
        uint8 indexed trancheId,
        uint lenderEffectiveAprWad,
        uint totalExpectedRewards,
        uint redeemedRewards
    );
    event LenderLockPlatformTokens(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderUnlockPlatformTokens(address indexed lender, uint8 indexed trancheId, uint256 amount);

    // Borrower //
    event BorrowerDepositFirstLossCapital(address indexed borrower, uint amount);
    event BorrowerBorrow(address indexed borrower, uint amount);
    event BorrowerPayInterest(
        address indexed borrower,
        uint amount,
        uint lendersDistributedAmount,
        uint feeSharingContractAmount
    );
    event BorrowerPayPenalty(address indexed borrower, uint amount);
    event BorrowerRepayPrincipal(address indexed borrower, uint amount);
    event BorrowerWithdrawFirstLossCapital(address indexed borrower, uint amount);

}