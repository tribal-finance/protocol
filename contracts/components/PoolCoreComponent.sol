// SPDX-License-Identifier: MIT

import "./Component.sol";

import "./PoolValidationComponent.sol";
import "../storage/PoolStorage.sol";
import "../factory/PoolFactory.sol";
import "../utils/Constants.sol";
import "../utils/Operations.sol";
import "../utils/Identifiers.sol";

pragma solidity 0.8.18;

contract PoolCoreComponent is Component {

    /*///////////////////////////////////
       MODIFIERS
    ///////////////////////////////////*/

    modifier authTrancheVault(uint8 _id) {
        _authTrancheVault(_id);
        _;
    }

    function _authTrancheVault(uint8 _id) internal view {
        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        address trancheVaultAddress = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", _id);
        require(_id < tranchesCount, "LP001"); // "LendingPool: invalid trancheVault id"
        require(trancheVaultAddress == msg.sender, "LP002"); // "LendingPool: trancheVault auth"
    }

    modifier onlyPoolBorrower() {
        _onlyPoolBorrower();
        _;
    }

    function _onlyPoolBorrower() internal view {
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        require(msg.sender == borrowerAddress, "LP003"); // "LendingPool: not a borrower"
    }

    modifier atStage(Constants.Stages _stage) {
        _atStage(_stage);
        _;
    }

    function _atStage(Constants.Stages _stage) internal view {
        Constants.Stages currentStage = Constants.Stages(poolStorage.getUint256(instanceId, "currentStage"));
        require(currentStage == _stage, "LP004"); // "LendingPool: not at correct stage"
    }

    modifier atStages2(Constants.Stages _stage1, Constants.Stages _stage2) {
        _atStages2(_stage1, _stage2);
        _;
    }

    function _atStages2(Constants.Stages _stage1, Constants.Stages _stage2) internal view {
        Constants.Stages currentStage = Constants.Stages(poolStorage.getUint256(instanceId, "currentStage"));
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
        Constants.Stages currentStage = Constants.Stages(poolStorage.getUint256(instanceId, "currentStage"));
        require(
            currentStage == _stage1 || currentStage == _stage2 || currentStage == _stage3,
            "LP004" // "LendingPool: not at correct stage"
        );
    }

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
    event PoolOpen(uint64 openedAt);
    event PoolFunded(uint64 fundedAt, uint collectedAssets);
    event PoolFundingFailed(uint64 fundingFailedAt);
    event PoolRepaid(uint64 repaidAt);
    event PoolDefaulted(uint64 defaultedAt);
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

    /*///////////////////////////////////
       INITIALIZATION
    ///////////////////////////////////*/

    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public override initializer {
        _initialize(_instanceId, Identifiers.POOL_CORE_COMPONENT, _poolStorage);
    }

    function initializeFromParams(
        Constants.LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress,
        address _poolFactoryAddress
    ) external {
        require(msg.sender == _poolFactoryAddress, "Sender must be poolFactory");

        PoolValidationComponent pvc = PoolValidationComponent(
            PoolFactory(_poolFactoryAddress).componentRegistry(instanceId, Identifiers.POOL_VALIDATION_COMPONENT)
        );

        pvc.validateInitParams(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);

        Operations.validateWad(params.trancheCoveragesWads);

        // Store parameters in poolStorage
        poolStorage.setString(instanceId, "name", params.name);
        poolStorage.setString(instanceId, "token", params.token);
        poolStorage.setAddress(instanceId, "stableCoinContractAddress", params.stableCoinContractAddress);
        poolStorage.setAddress(instanceId, "platformTokenContractAddress", params.platformTokenContractAddress);
        poolStorage.setUint256(instanceId, "minFundingCapacity", params.minFundingCapacity);
        poolStorage.setUint256(instanceId, "maxFundingCapacity", params.maxFundingCapacity);
        poolStorage.setUint256(instanceId, "fundingPeriodSeconds", params.fundingPeriodSeconds);
        poolStorage.setUint256(instanceId, "lendingTermSeconds", params.lendingTermSeconds);
        poolStorage.setAddress(instanceId, "borrowerAddress", params.borrowerAddress);
        poolStorage.setUint256(instanceId, "firstLossAssets", params.firstLossAssets);
        poolStorage.setUint256(instanceId, "borrowerTotalInterestRateWad", params.borrowerTotalInterestRateWad);
        poolStorage.setUint256(instanceId, "repaymentRecurrenceDays", params.repaymentRecurrenceDays);
        poolStorage.setUint256(instanceId, "gracePeriodDays", params.gracePeriodDays);
        poolStorage.setUint256(instanceId, "protocolFeeWad", params.protocolFeeWad);
        poolStorage.setUint256(instanceId, "defaultPenalty", params.defaultPenalty);
        poolStorage.setUint256(instanceId, "penaltyRateWad", params.penaltyRateWad);
        poolStorage.setUint256(instanceId, "tranchesCount", params.tranchesCount);

        for(uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheAPRsWads", i, params.trancheAPRsWads[i]);
        }

        for(uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheBoostedAPRsWads", i, params.trancheBoostedAPRsWads[i]);
        }

        for(uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheBoostRatios", i, params.trancheBoostRatios[i]);
        }

        for(uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheCoveragesWads", i, params.trancheCoveragesWads[i]);
        }

        for(uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayAddress(instanceId, "trancheVaultAddresses", i, _trancheVaultAddresses[i]);
        }

        poolStorage.setAddress(instanceId, "feeSharingContractAddress", _feeSharingContractAddress);
        poolStorage.setAddress(instanceId, "poolFactoryAddress", _poolFactoryAddress);

        // Initialize Pausable
        // __Pausable_init();

        // Set governance
        poolStorage.setAddress(instanceId, "governance", _authorityAddress);

        emit PoolInitialized(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);
    }
}
