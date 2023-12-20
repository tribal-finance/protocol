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
import "../modifiers/StateControl.sol";
import "../events/PoolEvents.sol";

pragma solidity 0.8.18;

contract PoolCoreComponent is Component, StateControl, PoolEvents {
    /*///////////////////////////////////
       MODIFIERS
    ///////////////////////////////////*/

    modifier authTrancheVault(uint8 _id) {
        _authTrancheVault(_id);
        _;
    }

    function _authTrancheVault(uint8 _id) internal view {
        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");
        address trancheVaultAddress = poolStorage.getArrayAddress("trancheVaultAddresses", _id);
        require(_id < tranchesCount, "LP001"); // "LendingPool: invalid trancheVault id"
        require(trancheVaultAddress == msg.sender, "LP002"); // "LendingPool: trancheVault auth"
    }

    /*///////////////////////////////////
       INITIALIZATION
    ///////////////////////////////////*/

    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public override initializer {
        Component._initialize(_instanceId, Identifiers.POOL_CORE_COMPONENT, _poolStorage);
        StateControl._initialize(_poolStorage);
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
        poolStorage.setString("name", params.name);
        poolStorage.setString("token", params.token);
        poolStorage.setAddress("stableCoinContractAddress", params.stableCoinContractAddress);
        poolStorage.setAddress("platformTokenContractAddress", params.platformTokenContractAddress);
        poolStorage.setUint256("minFundingCapacity", params.minFundingCapacity);
        poolStorage.setUint256("maxFundingCapacity", params.maxFundingCapacity);
        poolStorage.setUint256("fundingPeriodSeconds", params.fundingPeriodSeconds);
        poolStorage.setUint256("lendingTermSeconds", params.lendingTermSeconds);
        poolStorage.setAddress("borrowerAddress", params.borrowerAddress);
        poolStorage.setUint256("firstLossAssets", params.firstLossAssets);
        poolStorage.setUint256("borrowerTotalInterestRateWad", params.borrowerTotalInterestRateWad);
        poolStorage.setUint256("repaymentRecurrenceDays", params.repaymentRecurrenceDays);
        poolStorage.setUint256("gracePeriodDays", params.gracePeriodDays);
        poolStorage.setUint256("protocolFeeWad", params.protocolFeeWad);
        poolStorage.setUint256("defaultPenalty", params.defaultPenalty);
        poolStorage.setUint256("penaltyRateWad", params.penaltyRateWad);
        poolStorage.setUint256("tranchesCount", params.tranchesCount);

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256("trancheAPRsWads", i, params.trancheAPRsWads[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256("trancheBoostedAPRsWads", i, params.trancheBoostedAPRsWads[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256("trancheBoostRatios", i, params.trancheBoostRatios[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayUint256("trancheCoveragesWads", i, params.trancheCoveragesWads[i]);
        }

        for (uint256 i = 0; i < params.tranchesCount; i++) {
            poolStorage.setArrayAddress("trancheVaultAddresses", i, _trancheVaultAddresses[i]);
        }

        poolStorage.setAddress("feeSharingContractAddress", _feeSharingContractAddress);
        poolStorage.setAddress("poolFactoryAddress", _poolFactoryAddress);

        // Set governance
        poolStorage.setAddress("governance", _authorityAddress);

        emit PoolInitialized(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);
    }

    /*///////////////////////////////////
       ADMIN FUNCTIONS
    ///////////////////////////////////*/
    /** @dev Pauses the pool */
    function pause() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        poolStorage.setBoolean("paused", true);
    }

    /** @dev Unpauses the pool */
    function unpause() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        poolStorage.setBoolean("paused", false);
    }

    /** @notice Marks the pool as opened. This function has to be called by *owner* when
     * - sets openedAt to current block timestamp
     * - enables deposits and withdrawals to tranche vaults
     */
    function adminOpenPool() external atStage(Constants.Stages.FLC_DEPOSITED) whenNotPaused {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isAdmin(msg.sender), "not admin");
        uint256 openedAt = uint256(block.timestamp);
        poolStorage.setUint256("openedAt", openedAt);
        poolStorage.setUint256("currentStage", uint256(Constants.Stages.OPEN));

        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");

        for (uint i; i < tranchesCount; i++) {
            address tranche = poolStorage.getArrayAddress("trancheVaultAddresses", i);
            TrancheVault vault = TrancheVault(tranche);
            vault.enableDeposits();
            vault.enableWithdrawals();
        }

        emit PoolOpen(openedAt);
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
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));

        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        IERC20 platformTokenContractAddress = IERC20(
            poolStorage.getAddress("platformTokenContractAddress")
        );

        require(governance.isWhitelistedLender(msg.sender), "not lender");
        require(
            platformTokens <= pcc.lenderPlatformTokensByTrancheLockable(msg.sender, trancheId),
            "LP101" // "LendingPool: lock will lead to overboost"
        );
        require(platformTokenContractAddress.totalSupply() > 0, "Lock: Token Locking Disabled");

        // Using poolStorage for state management
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes("s_trancheRewardables", trancheId, msg.sender),
            (Constants.Rewardable)
        );
        r.lockedPlatformTokens += platformTokens;
        poolStorage.setMappingUint256AddressToBytes(
            "s_trancheRewardables",
            trancheId,
            msg.sender,
            abi.encode(r)
        );

        uint256 totalLockedTokens = poolStorage.getArrayUint256(
            "s_totalLockedPlatformTokensByTranche",
            trancheId
        ) + platformTokens;

        poolStorage.setArrayUint256("s_totalLockedPlatformTokensByTranche", trancheId, totalLockedTokens);

        SafeERC20.safeTransferFrom(platformTokenContractAddress, msg.sender, address(this), platformTokens);

        emit LenderLockPlatformTokens(msg.sender, trancheId, platformTokens);
        _emitLenderTrancheRewardsChange(msg.sender, trancheId);
    }

    function lenderUnlockPlatformTokensByTranche(
        uint8 trancheId,
        uint platformTokens
    ) external atStages2(Constants.Stages.REPAID, Constants.Stages.FLC_WITHDRAWN) whenNotPaused {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));

        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));

        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        require(governance.isWhitelistedLender(msg.sender), "not lender");

        // Check for roll-over settings
        Constants.RollOverSetting memory settings = abi.decode(
            poolStorage.getMappingAddressToBytes("s_rollOverSettings", msg.sender),
            (Constants.RollOverSetting)
        );

        require(!settings.platformTokens, "LP102"); // "LendingPool: tokens are locked for rollover"

        // Check for redeemable rewards
        require(pcc.lenderRewardsByTrancheRedeemable(msg.sender, trancheId) == 0, "LP103"); // "LendingPool: rewards not redeemed"

        IERC20 platformTokenContract = IERC20(poolStorage.getAddress("platformTokenContractAddress"));
        require(platformTokenContract.totalSupply() > 0, "Unlock: Token Locking Disabled");

        // Fetching Rewardable struct from poolStorage
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes("s_trancheRewardables", trancheId, msg.sender),
            (Constants.Rewardable)
        );

        require(r.lockedPlatformTokens >= platformTokens, "LP104"); // "LendingPool: not enough locked tokens"
        r.lockedPlatformTokens -= platformTokens;
        poolStorage.setMappingUint256AddressToBytes(
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
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        // Decoding roll-over settings from poolStorage
        Constants.RollOverSetting memory settings = abi.decode(
            poolStorage.getMappingAddressToBytes("s_rollOverSettings", msg.sender),
            (Constants.RollOverSetting)
        );
        require(!settings.rewards, "LP105"); // "LendingPool: rewards are locked for rollover"

        if (toWithdraw == 0) {
            return;
        }

        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
        PoolCalculationsComponent pcc = PoolCalculationsComponent(
            factory.componentRegistry(instanceId, Identifiers.POOL_CALCULATIONS_COMPONENT)
        );

        uint maxWithdraw = pcc.lenderRewardsByTrancheRedeemable(msg.sender, trancheId);
        require(toWithdraw <= maxWithdraw, "LP106"); // "LendingPool: amount to withdraw is too big"

        // Fetching and updating Rewardable struct from poolStorage
        Constants.Rewardable memory r = abi.decode(
            poolStorage.getMappingUint256AddressToBytes("s_trancheRewardables", trancheId, msg.sender),
            (Constants.Rewardable)
        );
        r.redeemedRewards += toWithdraw;
        poolStorage.setMappingUint256AddressToBytes(
            "s_trancheRewardables",
            trancheId,
            msg.sender,
            abi.encode(r)
        );

        IERC20 stableCoinContract = IERC20(poolStorage.getAddress("stableCoinContractAddress"));
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
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        // Decoding roll-over settings from poolStorage
        Constants.RollOverSetting memory settings = abi.decode(
            poolStorage.getMappingAddressToBytes("s_rollOverSettings", msg.sender),
            (Constants.RollOverSetting)
        );
        require(!settings.rewards, "LP105"); // "LendingPool: rewards are locked for rollover"

        uint256 tranchesCount = poolStorage.getUint256("tranchesCount");
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
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        address lender = msg.sender;

        // Creating the RollOverSetting struct and encoding it for storage
        Constants.RollOverSetting memory newSetting = Constants.RollOverSetting(
            true,
            principal,
            rewards,
            platformTokens
        );
        poolStorage.setMappingAddressToBytes("s_rollOverSettings", lender, abi.encode(newSetting));

        //PoolTransfers.lenderEnableRollOver(this, lender);
    }

    /** @notice cancels lenders intent to roll over the funds to the next pool.
     */
    function lenderDisableRollOver() external {
        TribalGovernance governance = TribalGovernance(poolStorage.getAddress("governance"));
        require(governance.isWhitelistedLender(msg.sender), "not lender");

        address lender = msg.sender;

        // Creating a disabled RollOverSetting struct and encoding it for storage
        Constants.RollOverSetting memory disabledSetting = Constants.RollOverSetting(false, false, false, false);
        poolStorage.setMappingAddressToBytes("s_rollOverSettings", lender, abi.encode(disabledSetting));
    }

    function _emitLenderTrancheRewardsChange(address lenderAddress, uint8 trancheId) internal {
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));

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

    function borrowerRecoverFirstLossCapital() external atStage(Constants.Stages.FUNDING_FAILED) {
        uint256 copyFirstLossAssets = poolStorage.getUint256("firstLossAssets");
        poolStorage.setUint256("firstLossAssets", 0);

        address stableCoinContract = poolStorage.getAddress("stableCoinContract");
        address borrowerAddress = poolStorage.getAddress("borrowerAddress");
        SafeERC20.safeTransfer(IERC20(stableCoinContract), borrowerAddress, copyFirstLossAssets);
    }

    /** @notice Make an interest payment.
     *  If the pool is delinquent, the minimum payment is penalty + whatever interest that needs to be paid to bring the pool back to healthy state
     */
    function borrowerPayInterest(uint assets) external onlyPoolBorrower whenNotPaused {
        PoolFactory factory = PoolFactory(poolStorage.getAddress("poolFactory"));
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

        uint256 protocolFeeWad = poolStorage.getUint256("protocolFeeWad");

        uint assetsToSendToFeeSharing = (feeableInterestAmount * protocolFeeWad) / Constants.WAD + penalty;
        uint assetsForLenders = assets - assetsToSendToFeeSharing;

        uint256 borrowerInterestRepaid = poolStorage.getUint256("borrowerInterestRepaid");

        poolStorage.setUint256("borrowerInterestRepaid", borrowerInterestRepaid + assets - penalty);

        IERC20 stableCoinContract = IERC20(poolStorage.getAddress("stableCoinContract"));

        if (assetsToSendToFeeSharing > 0) {
            address feeSharingContractAddress = poolStorage.getAddress("feeSharingContractAddress");
            SafeERC20.safeTransfer(stableCoinContract, feeSharingContractAddress, assetsToSendToFeeSharing);
        }

        SafeERC20.safeTransferFrom(stableCoinContract, msg.sender, address(this), assets);

        if (penalty > 0) {
            emit BorrowerPayPenalty(msg.sender, penalty);
        }
        address borrowerAddress = poolStorage.getAddress("borrowerAddress");

        emit BorrowerPayInterest(borrowerAddress, assets, assetsForLenders, assetsToSendToFeeSharing);
    }

    function onTrancheDeposit(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) {
        // TODO implement with new logic
        /**
         * 
         * 
         *         // 1. find / create the rewardable
        Rewardable storage rewardable = s_trancheRewardables[trancheId][depositorAddress];

        // 2. add lender to the lenders set
        s_lenders.add(depositorAddress);

        // 3. add to the staked assets
        rewardable.stakedAssets += amount;
        collectedAssets += amount;
        s_totalStakedAssetsByTranche[trancheId] += amount;

        // 4. set the start of the rewardable
        rewardable.start = uint64(block.timestamp);

        emit LenderDeposit(depositorAddress, trancheId, amount);
        _emitLenderTrancheRewardsChange(depositorAddress, trancheId);
         * 
         */
    }

    function onTrancheWithdraw(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) whenNotPaused {
        // TODO implement with new logic
        /***
         *      require(!s_rollOverSettings[depositorAddress].principal, "LP301"); // "LendingPool: principal locked for rollover"

        if (currentStage == Stages.REPAID || currentStage == Stages.FLC_WITHDRAWN) {
            emit LenderWithdraw(depositorAddress, trancheId, amount);
        } else {
            Rewardable storage rewardable = s_trancheRewardables[trancheId][depositorAddress];

            assert(rewardable.stakedAssets >= amount);

            rewardable.stakedAssets -= amount;
            collectedAssets -= amount;
            s_totalStakedAssetsByTranche[trancheId] -= amount;

            if (rewardable.stakedAssets == 0) {
                s_lenders.remove(depositorAddress);
            }
            emit LenderWithdraw(depositorAddress, trancheId, amount);
            _emitLenderTrancheRewardsChange(depositorAddress, trancheId);
        }
         */
    }
}
