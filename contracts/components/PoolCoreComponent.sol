// SPDX-License-Identifier: MIT

import "./Component.sol";

import "./PoolValidationComponent.sol";
import "./PoolCalculationsComponent.sol";
import "./PoolTransfersComponent.sol";
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

    modifier whenNotPaused() {
        require(poolStorage.getBoolean(instanceId, "paused"), "contract paused");
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
    event PoolOpen(uint256 openedAt);
    event PoolFunded(uint256 fundedAt, uint collectedAssets);
    event PoolFundingFailed(uint256 fundingFailedAt);
    event PoolRepaid(uint256 repaidAt);
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

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheAPRsWads", i, params.trancheAPRsWads[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheBoostedAPRsWads", i, params.trancheBoostedAPRsWads[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheBoostRatios", i, params.trancheBoostRatios[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256(instanceId, "trancheCoveragesWads", i, params.trancheCoveragesWads[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayAddress(instanceId, "trancheVaultAddresses", i, _trancheVaultAddresses[i]);
        }

        poolStorage.setAddress(instanceId, "feeSharingContractAddress", _feeSharingContractAddress);
        poolStorage.setAddress(instanceId, "poolFactoryAddress", _poolFactoryAddress);

        // Set governance
        poolStorage.setAddress(instanceId, "governance", _authorityAddress);

        emit PoolInitialized(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);
    }

    /*///////////////////////////////////
       ADMIN FUNCTIONS
    ///////////////////////////////////*/
    /** @dev Pauses the pool */
    function pause() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        poolStorage.setBoolean(instanceId, "paused", true);
    }

    /** @dev Unpauses the pool */
    function unpause() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        poolStorage.setBoolean(instanceId, "paused", false);
    }

    /** @notice Marks the pool as opened. This function has to be called by *owner* when
     * - sets openedAt to current block timestamp
     * - enables deposits and withdrawals to tranche vaults
     */
    function adminOpenPool() external atStage(Constants.Stages.FLC_DEPOSITED) whenNotPaused {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        uint256 openedAt = uint256(block.timestamp);
        poolStorage.setUint256(instanceId, "openedAt", openedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.OPEN));

        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            vault.enableDeposits();
            vault.enableWithdrawals();
        }

        emit PoolOpen(openedAt);
    }

    /** @notice Checks whether the pool was funded successfully or not.
     *  this function is expected to be called by *owner* once the funding period ends
     */
    function adminTransitionToFundedState() external atStage(Constants.Stages.OPEN) {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");

        uint256 openedAt = poolStorage.getUint256(instanceId, "openedAt");
        uint256 fundingPeriodSeconds = poolStorage.getUint256(instanceId, "fundingPeriodSeconds");
        require(
            block.timestamp >= openedAt + fundingPeriodSeconds,
            "Cannot accrue interest or declare failure before start time"
        );

        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        uint256 minFundingCapacity = poolStorage.getUint256(instanceId, "minFundingCapacity");
        if (collectedAssets >= minFundingCapacity) {
            _transitionToFundedStage();
        } else {
            _transitionToFundingFailedStage();
        }
    }

    function adminTransitionToDefaultedState(uint256 _instanceId) external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        uint256 fundedAt = poolStorage.getUint256(_instanceId, "fundedAt");
        uint256 lendingTermSeconds = poolStorage.getUint256(_instanceId, "lendingTermSeconds");
        require(block.timestamp >= fundedAt + lendingTermSeconds, "LP023"); 

        poolStorage.setUint256(_instanceId, "currentStage", uint256(Constants.Stages.DEFAULTED));
    }

    function _transitionToFundedStage() internal whenNotPaused {
        uint256 fundedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "fundedAt", fundedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FUNDED));

        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            
            vault.disableDeposits();
            vault.disableWithdrawals();
            vault.sendAssetsToPool(vault.totalAssets());
        }

        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        emit PoolFunded(fundedAt, collectedAssets);
    }

    function _transitionToFundingFailedStage() internal whenNotPaused {
        uint256 fundingFailedAt = block.timestamp;
        
        poolStorage.setUint256(instanceId, "fundingFailedAt", fundingFailedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FUNDING_FAILED));
        
        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);    
            vault.disableDeposits();
            vault.enableWithdrawals();
        }
        emit PoolFundingFailed(fundingFailedAt);
    }

    function _transitionToFlcDepositedStage(uint flcAssets) internal whenNotPaused {
        uint256 flcDepositedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "flcDepositedAt", flcDepositedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FLC_DEPOSITED));

        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        emit BorrowerDepositFirstLossCapital(borrowerAddress, flcAssets);
    }

    function _transitionToBorrowedStage(uint amountToBorrow) internal whenNotPaused {
        uint256 borrowedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "borrowedAt", borrowedAt);
        poolStorage.setUint256(instanceId, "borrowedAssets", amountToBorrow);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.BORROWED));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");

        emit BorrowerBorrow(borrowerAddress, amountToBorrow);
    }

    function _transitionToPrincipalRepaidStage(uint repaidPrincipal) internal whenNotPaused {
        uint256 repaidAt = block.timestamp;
        poolStorage.setUint256(instanceId, "repaidAt", repaidAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.REPAID));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        emit BorrowerRepayPrincipal(borrowerAddress, repaidPrincipal);
        emit PoolRepaid(repaidAt);
    }

    function _transitionToFlcWithdrawnStage(uint flcAssets) internal whenNotPaused {
        uint256 flcWithdrawntAt = block.timestamp;
        poolStorage.setUint256(instanceId, "flcWithdrawntAt", flcWithdrawntAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.FLC_WITHDRAWN));
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        emit BorrowerWithdrawFirstLossCapital(borrowerAddress, flcAssets);
    }

    function _claimTrancheInterestForLender(address lender, uint8 trancheId) internal {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT));
        uint rewards = pcc.lenderRewardsByTrancheRedeemable(lender, trancheId);
        if (rewards > 0) {
            Constants.Rewardable memory rewardable = abi.decode(poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lender), (Constants.Rewardable));
            rewardable.redeemedRewards += rewards;
            poolStorage.setMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lender, abi.encode(rewardable));
            PoolTransfersComponent ptc = PoolTransfersComponent(factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT));
            ptc.doTransferOut(lender, rewards);
            emit LenderWithdrawInterest(lender, trancheId, rewards);
        }
    }
}
