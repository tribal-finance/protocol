// SPDX-License-Identifier: MIT

import "../utils/Constants.sol";
import "../storage/PoolStorage.sol";

pragma solidity 0.8.18;

abstract contract StateControl {
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

    PoolStorage internal _poolStorage;
    uint256 internal _instanceId;

    function _initialize(PoolStorage __poolStorage, uint256 __instanceId) internal {
        _poolStorage = __poolStorage;
        _instanceId = __instanceId;
    }

    modifier onlyPoolBorrower() {
        _onlyPoolBorrower();
        _;
    }

    function _onlyPoolBorrower() internal view {
        address borrowerAddress = _poolStorage.getAddress(_instanceId, "borrowerAddress");
        require(msg.sender == borrowerAddress, "LP003"); // "LendingPool: not a borrower"
    }

    modifier whenNotPaused() {
        require(_poolStorage.getBoolean(_instanceId, "paused"), "contract paused");
        _;
    }

    modifier atStage(Constants.Stages _stage) {
        _atStage(_stage);
        _;
    }

    function _atStage(Constants.Stages _stage) internal view {
        Constants.Stages currentStage = Constants.Stages(_poolStorage.getUint256(_instanceId, "currentStage"));
        require(currentStage == _stage, "LP004"); // "LendingPool: not at correct stage"
    }

    modifier atStages2(Constants.Stages _stage1, Constants.Stages _stage2) {
        _atStages2(_stage1, _stage2);
        _;
    }

    function _atStages2(Constants.Stages _stage1, Constants.Stages _stage2) internal view {
        Constants.Stages currentStage = Constants.Stages(_poolStorage.getUint256(_instanceId, "currentStage"));
        require(currentStage == _stage1 || currentStage == _stage2, "LP004"); // "LendingPool: not at correct stage"
    }

    modifier atStages3(
        Constants.Stages _stage1,
        Constants.Stages _stage2,
        Constants.Stages _stage3
    ) {
        _atStages3(_stage1, _stage2, _stage3);
        _;
    }

    function _atStages3(Constants.Stages _stage1, Constants.Stages _stage2, Constants.Stages _stage3) internal view {
        Constants.Stages currentStage = Constants.Stages(_poolStorage.getUint256(_instanceId, "currentStage"));
        require(
            currentStage == _stage1 || currentStage == _stage2 || currentStage == _stage3,
            "LP004" // "LendingPool: not at correct stage"
        );
    }
}
