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
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );
        uint256 rewards = pcc.lenderRewardsByTrancheRedeemable(lender, trancheId);
        if (rewards > 0) {
            Constants.Rewardable memory rewardable = abi.decode(
                poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, lender),
                (Constants.Rewardable)
            );
            rewardable.redeemedRewards += rewards;
            poolStorage.setMappingUint256AddressToBytes(
                instanceId,
                "s_trancheRewardables",
                trancheId,
                lender,
                abi.encode(rewardable)
            );
            PoolTransfersComponent ptc = PoolTransfersComponent(
                factory.componentRegistry(instanceId, Identifiers.POOL_TRANSFERS_COMPONENT)
            );
            ptc.doTransferOut(lender, rewards);
            emit LenderWithdrawInterest(lender, trancheId, rewards);
        }
    }

    function _claimInterestForAllLenders() internal {
        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        uint256 lenderCount = poolStorage.getUint256(instanceId, "lenderCount");

        for (uint256 i = 0; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            for (uint j; j < lenderCount; j++) {
                address lender = poolStorage.getArrayAddress(instanceId, "s_lenders", j);
                _claimTrancheInterestForLender(lender, vault.id());
            }
        }
    }

    /**
     * @notice Transitions the pool to the defaulted state and pays out remaining assets to the tranche vaults
     * @dev This function is expected to be called by *owner* after the maturity date has passed and principal has not been repaid
     */
    function _transitionToDefaultedStage() internal whenNotPaused {
        uint256 defaultedAt = block.timestamp;
        poolStorage.setUint256(instanceId, "defaultedAt", defaultedAt);
        poolStorage.setUint256(instanceId, "currentStage", uint256(Constants.Stages.DEFAULTED));

        _claimInterestForAllLenders();

        // TODO: Update repaid interest to be the total interest paid to lenders
        // TODO: Decide if protocol fees should be paid in event of default
        IERC20 stableCoinContract = IERC20(poolStorage.getAddress(instanceId, "stableCoinContractAddress"));
        uint availableAssets = stableCoinContract.balanceOf(address(this));

        uint256 trancheCount = poolStorage.getUint256(instanceId, "trancheCount");
        for (uint i = 0; i < trancheCount; i++) {
            address trancheVaultAddress = poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", i);
            TrancheVault tv = TrancheVault(trancheVaultAddress);
            uint256 trancheCoverageWad = poolStorage.getArrayUint256(instanceId, "trancheCoveragesWads", i);
            uint assetsToSend = (trancheCoverageWad * availableAssets) / Constants.WAD;
            uint trancheDefaultRatioWad = (assetsToSend * Constants.WAD) / tv.totalAssets();

            if (assetsToSend > 0) {
                SafeERC20.safeTransfer(stableCoinContract, address(tv), assetsToSend);
            }
            availableAssets -= assetsToSend;
            tv.setDefaultRatioWad(trancheDefaultRatioWad);
            tv.enableWithdrawals();
        }

        emit PoolDefaulted(poolStorage.getUint256(instanceId, "defaultedAt"));
    }

    /*///////////////////////////////////
      Lender (please also see onTrancheDeposit() and onTrancheWithdraw())
      Error group: 1
    ///////////////////////////////////*/

    /** @notice Lock platform tokens in order to get APR boost
     *  @param trancheId tranche id
     *  @param platformTokens amount of PLATFORM tokens to lock
     */
    function lenderLockPlatformTokensByTranche(
        uint8 trancheId,
        uint platformTokens
    ) external atStage(Constants.Stages.OPEN) whenNotPaused {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));

        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        IERC20 platformTokenContractAddress = IERC20(
            poolStorage.getAddress(instanceId, "platformTokenContractAddress")
        );

        require(governance.isWhitelistedLender(msg.sender), "not lender");
        require(
            platformTokens <= pcc.lenderPlatformTokensByTrancheLockable(msg.sender, trancheId),
            "LP101" // "LendingPool: lock will lead to overboost"
        );
        require(platformTokenContractAddress.totalSupply() > 0, "Lock: Token Locking Disabled");

        // Using poolStorage for state management
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, msg.sender),
            (Constants.Rewardable)
        );
        r.lockedPlatformTokens += platformTokens;
        poolStorage.setMappingUint256AddressToBytes(
            instanceId,
            "s_trancheRewardables",
            trancheId,
            msg.sender,
            abi.encode(r)
        );

        uint256 totalLockedTokens = poolStorage.getArrayUint256(
            instanceId,
            "s_totalLockedPlatformTokensByTranche",
            trancheId
        ) + platformTokens;

        poolStorage.setArrayUint256(instanceId, "s_totalLockedPlatformTokensByTranche", trancheId, totalLockedTokens);

        SafeERC20.safeTransferFrom(platformTokenContractAddress, msg.sender, address(this), platformTokens);

        emit LenderLockPlatformTokens(msg.sender, trancheId, platformTokens);
        _emitLenderTrancheRewardsChange(msg.sender, trancheId);
    }

    function lenderUnlockPlatformTokensByTranche(
        uint8 trancheId,
        uint platformTokens
    ) external atStages2(Constants.Stages.REPAID, Constants.Stages.FLC_WITHDRAWN) whenNotPaused {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));

        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));

        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        require(governance.isWhitelistedLender(msg.sender), "not lender");

        // Check for roll-over settings
        Constants.RollOverSetting memory settings = abi.decode(
            poolStorage.getMappingAddressToBytes(instanceId, "s_rollOverSettings", msg.sender),
            (Constants.RollOverSetting)
        );

        require(!settings.platformTokens, "LP102"); // "LendingPool: tokens are locked for rollover"

        // Check for redeemable rewards
        require(pcc.lenderRewardsByTrancheRedeemable(msg.sender, trancheId) == 0, "LP103"); // "LendingPool: rewards not redeemed"

        IERC20 platformTokenContract = IERC20(poolStorage.getAddress(instanceId, "platformTokenContractAddress"));
        require(platformTokenContract.totalSupply() > 0, "Unlock: Token Locking Disabled");

        // Fetching Rewardable struct from poolStorage
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, msg.sender),
            (Constants.Rewardable)
        );

        require(r.lockedPlatformTokens >= platformTokens, "LP104"); // "LendingPool: not enough locked tokens"
        r.lockedPlatformTokens -= platformTokens;
        poolStorage.setMappingUint256AddressToBytes(
            instanceId,
            "s_trancheRewardables",
            trancheId,
            msg.sender,
            abi.encode(r)
        );

        SafeERC20.safeTransfer(platformTokenContract, msg.sender, platformTokens);

        emit LenderUnlockPlatformTokens(msg.sender, trancheId, platformTokens);
    }

    /** @notice Redeem currently available rewards for a tranche
     *  @param trancheId tranche id
     *  @param toWithdraw amount of rewards to withdraw
     */
    function lenderRedeemRewardsByTranche(
        uint8 trancheId,
        uint toWithdraw
    )
        public
        atStages3(Constants.Stages.BORROWED, Constants.Stages.REPAID, Constants.Stages.FLC_WITHDRAWN)
        whenNotPaused
    {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        // Decoding roll-over settings from poolStorage
        Constants.RollOverSetting memory settings = abi.decode(
            poolStorage.getMappingAddressToBytes(instanceId, "s_rollOverSettings", msg.sender),
            (Constants.RollOverSetting)
        );
        require(!settings.rewards, "LP105"); // "LendingPool: rewards are locked for rollover"

        if (toWithdraw == 0) {
            return;
        }

        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint maxWithdraw = pcc.lenderRewardsByTrancheRedeemable(msg.sender, trancheId);
        require(toWithdraw <= maxWithdraw, "LP106"); // "LendingPool: amount to withdraw is too big"

        // Fetching and updating Rewardable struct from poolStorage
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes(instanceId, "s_trancheRewardables", trancheId, msg.sender),
            (Constants.Rewardable)
        );
        r.redeemedRewards += toWithdraw;
        poolStorage.setMappingUint256AddressToBytes(
            instanceId,
            "s_trancheRewardables",
            trancheId,
            msg.sender,
            abi.encode(r)
        );

        IERC20 stableCoinContract = IERC20(poolStorage.getAddress(instanceId, "stableCoinContractAddress"));
        SafeERC20.safeTransfer(stableCoinContract, msg.sender, toWithdraw);

        emit LenderWithdrawInterest(msg.sender, trancheId, toWithdraw);
        _emitLenderTrancheRewardsChange(msg.sender, trancheId);
    }

    /** @notice Redeem currently available rewards for two tranches
     *  @param toWithdraws amount of rewards to withdraw accross all tranches
     */
    function lenderRedeemRewards(
        uint[] calldata toWithdraws
    )
        external
        atStages3(Constants.Stages.BORROWED, Constants.Stages.REPAID, Constants.Stages.FLC_WITHDRAWN)
        whenNotPaused
    {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        // Decoding roll-over settings from poolStorage
        Constants.RollOverSetting memory settings = abi.decode(
            poolStorage.getMappingAddressToBytes(instanceId, "s_rollOverSettings", msg.sender),
            (Constants.RollOverSetting)
        );
        require(!settings.rewards, "LP105"); // "LendingPool: rewards are locked for rollover"

        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        require(toWithdraws.length == tranchesCount, "LP107"); // "LendingPool: wrong amount of tranches"

        for (uint8 i; i < toWithdraws.length; i++) {
            lenderRedeemRewardsByTranche(i, toWithdraws[i]);
        }
    }

    /*///////////////////////////////////
       Rollover settings
    ///////////////////////////////////*/
    /** @notice marks the intent of the lender to roll over their capital to the upcoming pool (called by older pool)
     *  if you opt to roll over you will not be able to withdraw stablecoins / platform tokens from the pool
     *  @param principal whether the principal should be rolled over
     *  @param rewards whether the rewards should be rolled over
     *  @param platformTokens whether the platform tokens should be rolled over
     */
    function lenderEnableRollOver(bool principal, bool rewards, bool platformTokens) external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        address lender = msg.sender;

        // Creating the RollOverSetting struct and encoding it for storage
        Constants.RollOverSetting memory newSetting = Constants.RollOverSetting(
            true,
            principal,
            rewards,
            platformTokens
        );
        poolStorage.setMappingAddressToBytes(instanceId, "s_rollOverSettings", lender, abi.encode(newSetting));

        //PoolTransfers.lenderEnableRollOver(this, lender);
    }

    /** @notice cancels lenders intent to roll over the funds to the next pool.
     */
    function lenderDisableRollOver() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress(instanceId, "governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        address lender = msg.sender;

        // Creating a disabled RollOverSetting struct and encoding it for storage
        Constants.RollOverSetting memory disabledSetting = Constants.RollOverSetting(false, false, false, false);
        poolStorage.setMappingAddressToBytes(instanceId, "s_rollOverSettings", lender, abi.encode(disabledSetting));
    }

    function _emitLenderTrancheRewardsChange(address lenderAddress, uint8 trancheId) internal {
        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));

        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        emit LenderTrancheRewardsChange(
            lenderAddress,
            trancheId,
            pcc.lenderEffectiveAprByTrancheWad(lenderAddress, trancheId),
            pcc.lenderTotalExpectedRewardsByTranche(lenderAddress, trancheId),
            pcc.lenderRewardsByTrancheRedeemed(lenderAddress, trancheId)
        );
    }

    /*///////////////////////////////////
       Borrower functions
       Error group: 2
    ///////////////////////////////////*/
    /** @notice Deposits first loss capital into the pool
     *  should be called by the borrower before the pool can start
     */
    function borrowerDepositFirstLossCapital()
        external
        onlyPoolBorrower
        atStage(Constants.Stages.INITIAL)
        whenNotPaused
    {
        uint256 firstLossAssets = poolStorage.getUint256(instanceId, "firstLossAssets");
        _transitionToFlcDepositedStage(firstLossAssets);
        address stableCoinContract = poolStorage.getAddress(instanceId, "stableCoinContract");
        SafeERC20.safeTransferFrom(IERC20(stableCoinContract), msg.sender, address(this), firstLossAssets);
    }

    function borrow() external onlyPoolBorrower atStage(Constants.Stages.FUNDED) whenNotPaused {
        uint256 collectedAssets = poolStorage.getUint256(instanceId, "collectedAssets");
        _transitionToBorrowedStage(collectedAssets);

        address stableCoinContract = poolStorage.getAddress(instanceId, "stableCoinContract");
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        SafeERC20.safeTransfer(IERC20(stableCoinContract), borrowerAddress, collectedAssets);
    }

    function borrowerRecoverFirstLossCapital() external atStage(Constants.Stages.FUNDING_FAILED) {
        uint256 copyFirstLossAssets = poolStorage.getUint256(instanceId, "firstLossAssets");
        poolStorage.setUint256(instanceId, "firstLossAssets", 0);

        address stableCoinContract = poolStorage.getAddress(instanceId, "stableCoinContract");
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");
        SafeERC20.safeTransfer(IERC20(stableCoinContract), borrowerAddress, copyFirstLossAssets);
    }

    /** @notice Make an interest payment.
     *  If the pool is delinquent, the minimum payment is penalty + whatever interest that needs to be paid to bring the pool back to healthy state
     */
    function borrowerPayInterest(uint assets) external onlyPoolBorrower whenNotPaused {

        PoolFactory factory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint penalty = pcc.borrowerPenaltyAmount();
        require(penalty < assets, "LP201"); // "LendingPool: penalty cannot be more than assets"

        if (penalty > 0) {
            uint balanceDifference = pcc.poolBalanceThreshold() - pcc.poolBalance();
            require(assets >= penalty + balanceDifference, "LP202"); // "LendingPool: penalty+interest will not bring pool to healthy state"
        }

        uint feeableInterestAmount = assets - penalty;
        if (feeableInterestAmount > pcc.borrowerOutstandingInterest()) {
            feeableInterestAmount = pcc.borrowerOutstandingInterest();
        }

        uint256 protocolFeeWad = poolStorage.getUint256(instanceId, "protocolFeeWad");

        uint assetsToSendToFeeSharing = (feeableInterestAmount * protocolFeeWad) / Constants.WAD + penalty;
        uint assetsForLenders = assets - assetsToSendToFeeSharing;

        uint256 borrowerInterestRepaid = poolStorage.getUint256(instanceId, "borrowerInterestRepaid");

        poolStorage.setUint256(instanceId, "borrowerInterestRepaid", borrowerInterestRepaid + assets - penalty);

        IERC20 stableCoinContract = IERC20(poolStorage.getAddress(instanceId, "stableCoinContract"));

        if (assetsToSendToFeeSharing > 0) {
            address feeSharingContractAddress = poolStorage.getAddress(instanceId, "feeSharingContractAddress");
            SafeERC20.safeTransfer(stableCoinContract, feeSharingContractAddress, assetsToSendToFeeSharing);
        }

        SafeERC20.safeTransferFrom(stableCoinContract, msg.sender, address(this), assets);

        if (penalty > 0) {
            emit BorrowerPayPenalty(msg.sender, penalty);
        }
        address borrowerAddress = poolStorage.getAddress(instanceId, "borrowerAddress");

        emit BorrowerPayInterest(borrowerAddress, assets, assetsForLenders, assetsToSendToFeeSharing);
    }
}
