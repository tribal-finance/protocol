// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./LendingPoolState.sol";
import "../vaults/TrancheVault.sol";
import "../fee_sharing/IFeeSharing.sol";
// import "hardhat/.sol";

contract LendingPool is ILendingPool, Initializable, AuthorityAware, PausableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathUpgradeable for uint;

    /*///////////////////////////////////
       CONSTANTS
    ///////////////////////////////////*/
    string public constant VERSION = "2023-05-25";

    uint internal constant WAD = 10 ** 18;
    uint internal constant DAY = 24 * 60 * 60;
    uint internal constant YEAR = 365 * DAY;

    struct Rewardable {
        uint stakedAssets;
        uint lockedPlatformTokens;
        uint redeemedRewards;
        uint64 start;
    }

    enum Stages {
        INITIAL,
        OPEN,
        FUNDED,
        FUNDING_FAILED,
        FLC_DEPOSITED,
        BORROWED,
        BORROWER_INTEREST_REPAID,
        DELINQUENT,
        REPAID,
        DEFAULTED
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


    /*///////////////////////////////////
       CONTRACT VARIABLES
    ///////////////////////////////////*/
    /*Initializer parameters*/
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
    /* Other contract addresses */
    address public feeSharingContractAddress;
    address[] public trancheVaultAddresses;
    /* Some Timestamps */
    uint64 public openedAt;
    uint64 public fundedAt;
    uint64 public fundingFailedAt;
    uint64 public flcDepositedAt;
    uint64 public borrowedAt;
    uint64 public repaidAt;
    /* Interests & Yields */
    uint public collectedAssets;
    uint public borrowedAssets;
    uint public borrowerInterestRepaid;

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

    /*///////////////////////////////////
       MODIFIERS
    ///////////////////////////////////*/
    modifier authTrancheVault(uint8 id) {
        require(id < trancheVaultAddresses().length, "LP001"); // "LendingPool: invalid trancheVault id"
        require(trancheVaultAddresses()[id] == _msgSender(), "LP002"); // "LendingPool: trancheVault auth"
        _;
    }

    modifier onlyPoolBorrower() {
        require(_msgSender() == borrowerAddress, "LP003");// "LendingPool: not a borrower"
        _;
    }

    modifier atStage(Stages _stage) {
        require(currentStage() == _stage, "LP004");// "LendingPool: not at correct stage"
        _;
    }

    modifier atStages2(Stages _stage1, Stages _stage2) {
        require(currentStage() == _stage1 || currentStage() == _stage2, "LP004");// "LendingPool: not at correct stage"
        _;
    }

    modifier atStages3(
        Stages _stage1,
        Stages _stage2,
        Stages _stage3
    ) {
        require(
            currentStage() == _stage1 || currentStage() == _stage2 || currentStage() == _stage3,
            "LP004" // "LendingPool: not at correct stage"
        );
        _;
    }

    /*///////////////////////////////////
       EVENTS
    ///////////////////////////////////*/

    // State Changes //
    event PoolInitialized(LendingPoolParams params,
        address[] _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    );
    event PoolOpen(address indexed actor);
    event PoolFunded();
    event PoolFundingFailed();
    event PoolRepaid();
    event PoolDelinquent();
    event PoolRecoverFromDelinquency();
    event PoolDefaulted();

    // Lender //
    event LenderDeposit(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderWithdraw(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderWithdrawInterest(address indexed lender, uint8 indexed trancheId, uint256 amount);
    event LenderTrancheRewardsChange(
        address indexed lender,
        uint8 indexed trancheId,
        uint lenderEffectiveAprWad,
        uint totalExpectedRewards,
        uint totalGeneratedRewards,
        uint redeemedRewards,
        uint redeemableRewards
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

    /*///////////////////////////////////
       INITIALIZATION
    ///////////////////////////////////*/

    function initialize(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    ) external initializer {
        _validateInitParams(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);

        name = params.name;
        token = params.token;
        stableCoinContractAddress = params.stableCoinContractAddress;
        platformTokenContractAddress = params.platformTokenContractAddress;
        minFundingCapacity = params.minFundingCapacity;
        maxFundingCapacity = params.maxFundingCapacity;
        fundingPeriodSeconds = params.fundingPeriodSeconds;
        lendingTermSeconds = params.lendingTermSeconds;
        borrowerAddress = params.borrowerAddress;
        firstLossAssets = params.firstLossAssets;
        borrowerTotalInterestRateWad = params.borrowerTotalInterestRateWad;
        repaymentRecurrenceDays = params.repaymentRecurrenceDays;
        gracePeriodDays = params.gracePeriodDays;
        protocolFeeWad = params.protocolFeeWad;
        defaultPenalty = params.defaultPenalty;
        penaltyRateWad = params.penaltyRateWad;
        tranchesCount = params.tranchesCount;
        trancheAPRsWads = params.trancheAPRsWads;
        trancheBoostedAPRsWads = params.trancheBoostedAPRsWads;
        trancheBoostRatios = params.trancheBoostRatios;
        trancheCoveragesWads = params.trancheCoveragesWads;

        trancheVaultAddresses = _trancheVaultAddresses;
        feeSharingContractAddress = _feeSharingContractAddress;

        __Ownable_init();
        __Pausable_init();
        __AuthorityAware__init(_authorityAddress);

        emit PoolInitialized(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);
    }

    /// @dev validates initializer params
    function _validateInitParams(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    ) internal pure {
        require(params.stableCoinContractAddress != address(0), "LP005");// "LendingPool: stableCoinContractAddress empty"

        require(params.minFundingCapacity > 0, "LP006");// "LendingPool: minFundingCapacity == 0"
        require(params.maxFundingCapacity > 0, "LP007");// "LendingPool: maxFundingCapacity == 0"
        require(
            params.maxFundingCapacity >= params.minFundingCapacity,
            "LP008" // "LendingPool: maxFundingCapacity < minFundingCapacity"
        );

        require(params.fundingPeriodSeconds > 0, "LP009");// "LendingPool: fundingPeriodSeconds == 0"
        require(params.lendingTermSeconds > 0, "LP010");// "LendingPool: lendingTermSeconds == 0"
        require(params.borrowerAddress != address(0), "LP011");// "LendingPool: borrowerAddress empty"
        require(params.borrowerTotalInterestRateWad > 0, "LP012");// "LendingPool: borrower interest rate = 0%"
        require(params.protocolFeeWad > 0, "LP013");// "LendingPool: protocolFee == 0%"
        require(params.penaltyRateWad > 0, "LP014");// "LendingPool: penaltyRate == 0"

        require(params.tranchesCount > 0, "LP015");// "LendingPool: tranchesCount == 0"
        require(_trancheVaultAddresses.length == params.tranchesCount, "LP016");// "LendingPool: trancheAddresses length"
        require(params.trancheAPRsWads.length == params.tranchesCount, "LP017");// "LP001");// "LendingPool: tranche APRs length"
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

        require(_feeSharingContractAddress != address(0), "LP021");// "LendingPool: feeSharingAddress empty"
        require(_authorityAddress != address(0), "LP022");// "LendingPool: authorityAddress empty"
    }

    /*///////////////////////////////////
       ADMIN FUNCTIONS
    ///////////////////////////////////*/

    /** @dev Pauses the pool */
    function pause() external onlyOwnerOrAdmin {
        _pause();
    }

    /** @dev Unpauses the pool */
    function unpause() external onlyOwnerOrAdmin {
        _unpause();
    }

    /*///////////////////////////////////
       STATE MANAGEMENT
    ///////////////////////////////////*/

    /// @notice This function returns the current stage of the pool
    function currentStage() public view returns (Stages stage) {
        if (repaidAt != 0) {
            return Stages.REPAID;
        }
        if (borrowedAt != 0) {
            return Stages.BORROWED;
        }
        if (fundingFailedAt != 0) {
            return Stages.FUNDING_FAILED;
        }
        if (fundedAt != 0) {
            return Stages.FUNDED;
        }
        if (openedAt != 0) {
            return Stages.OPEN;
        }
        if (flcDepositedAt != 0) {
            return Stages.FLC_DEPOSITED;
        }

        return Stages.INITIAL;
    }

    /** @notice Marks the pool as opened. This function has to be called by *owner* when
     * - sets openedAt to current block timestamp
     * - enables deposits and withdrawals to tranche vaults
     */
    function adminOpenPool() external onlyWhitelisted atStage(Stages.FLC_DEPOSITED) {
        for (uint i; i < trancheVaultAddresses.length; i++) {
            _trancheVaultContracts()[i].enableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        openedAt = uint64(block.timestamp);
        emit PoolOpen(_msgSender());
    }

    /** @notice Checks whether the pool was funded successfully or not.
     *  this function is expected to be called by *owner* once the funding period ends
     */
    function adminTransitionToFundedState() external onlyOwnerOrAdmin atStage(Stages.OPEN) {
        if (collectedAssets >= minFundingCapacity) {
            _transitionToFundedStage();
        } else {
            _transitionToFundingFailedStage();
        }
    }

    function _transitionToFundedStage() internal {
        fundedAt = uint64(block.timestamp);

        for (uint i; i < _trancheVaultContracts().length; i++) {
            TrancheVault tv = _trancheVaultContracts()[i];
            tv.disableDeposits();
            tv.disableWithdrawals();
            tv.sendAssetsToPool(tv.totalAssets());
        }

        emit PoolFunded();
    }

    function _transitionToFundingFailedStage() internal {
        fundingFailedAt = uint64(block.timestamp);

        for (uint i; i < trancheVaultAddresses.length; i++) {
            _trancheVaultContracts()[i].disableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        emit PoolFundingFailed();
    }

    function _transitionToFlcDepositedStage(uint flcAssets) internal {
        flcDepositedAt = uint64(block.timestamp);
        emit BorrowerDepositFirstLossCapital(borrowerAddress, flcAssets);
    }

    function _transitionToBorrowedStage(uint amountToBorrow) internal {
        borrowedAt = uint64(block.timestamp);
        borrowedAssets = amountToBorrow;

        emit BorrowerBorrow(borrowerAddress, amountToBorrow);
    }

    function _transitionToPrincipalRepaidStage(uint repaidPrincipal) internal {
        repaidAt = uint64(block.timestamp);
        emit BorrowerRepayPrincipal(borrowerAddress, repaidPrincipal);
        emit PoolRepaid();
    }

    /*///////////////////////////////////
      Lender (please also see onTrancheDeposit() and onTrancheWithdraw())
      Error group: 1
    ///////////////////////////////////*/

    /** @notice Lock tribal tokens in order to get APR boost
     *  @param trancheId tranche id
     *  @param platformTokens amount of TRIBL tokens to lock
     */
    function lenderLockPlatformTokensByTranche(
        uint8 trancheId,
        uint platformTokens
    ) external onlyLender atStage(Stages.OPEN) {
        require(
            platformTokens <= lenderPlatformTokensByTrancheLockable(_msgSender(), trancheId),
            "LP101" //"LendingPool: lock will lead to overboost"
        );
        Rewardable storage r = s_trancheRewardables[trancheId][_msgSender()];
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(platformTokenContractAddress),
            _msgSender(),
            address(this),
            platformTokens
        );
        r.lockedPlatformTokens += platformTokens;
        s_totalLockedPlatformTokensByTranche[trancheId] += platformTokens;

        emit LenderLockPlatformTokens(_msgSender(), trancheId, platformTokens);
        _emitLenderTrancheRewardsChange(_msgSender(), trancheId);
    }

    /** @notice Unlock tribal tokens after the pool is repaid AND rewards are redeemed
     *  @param trancheId tranche id
     *  @param platformTokens amount of TRIBL tokens to unlock
     */
    function lenderUnlockPlatformTokensByTranche(
        uint8 trancheId,
        uint platformTokens
    ) external onlyLender atStage(Stages.REPAID) {
        require(!s_rollOverSettings[msg.sender].platformTokens, "LP102");// "LendingPool: tokens are locked for rollover"
        require(lenderRewardsByTrancheRedeemable(_msgSender(), trancheId) == 0, "LP103"); // "LendingPool: rewards not redeemed"

        Rewardable storage r = s_trancheRewardables[trancheId][_msgSender()];

        require(r.lockedPlatformTokens >= platformTokens, "LP104"); // LendingPool: not enough locked tokens"
        r.lockedPlatformTokens -= platformTokens;
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(platformTokenContractAddress),
            _msgSender(),
            platformTokens
        );

        emit LenderUnlockPlatformTokens(_msgSender(), trancheId, platformTokens);
    }

    /** @notice Redeem currently available rewards for a tranche
     *  @param trancheId tranche id
     *  @param toWithdraw amount of rewards to withdraw
     */
    function lenderRedeemRewardsByTranche(
        uint8 trancheId,
        uint toWithdraw
    ) public onlyLender atStages3(Stages.BORROWED, Stages.BORROWER_INTEREST_REPAID, Stages.REPAID) {
        require(!s_rollOverSettings[msg.sender].rewards, "LP105"); // "LendingPool: rewards are locked for rollover"
        if (toWithdraw == 0) {
            return;
        }
        uint maxWithdraw = lenderRewardsByTrancheRedeemable(_msgSender(), trancheId);
        require(toWithdraw < maxWithdraw, "LP106"); // "LendingPool: amount to withdraw is too big"
        s_trancheRewardables[trancheId][_msgSender()].redeemedRewards += toWithdraw;

        SafeERC20Upgradeable.safeTransfer(_stableCoinContract(), _msgSender(), toWithdraw);

        // if (IERC20Upgradeable(stableCoinContractAddress()).balanceOf(address(this)) < poolBalanceThreshold()) {
        //     _transitionToDelinquentStage();
        // }

        emit LenderWithdrawInterest(_msgSender(), trancheId, toWithdraw);
        _emitLenderTrancheRewardsChange(_msgSender(), trancheId);
    }

    /** @notice Redeem currently available rewards for two tranches
     *  @param toWithdraws amount of rewards to withdraw accross all tranches
     */
    function lenderRedeemRewards(
        uint[] calldata toWithdraws
    ) external onlyLender atStages3(Stages.BORROWED, Stages.BORROWER_INTEREST_REPAID, Stages.REPAID) {
        require(!s_rollOverSettings[msg.sender].rewards, "LP105"); //"LendingPool: rewards are locked for rollover"
        require(toWithdraws.length == tranchesCount(), "LP107"); //"LendingPool: wrong amount of tranches"
        for(uint8 i; i < toWithdraws.length; i++) {
            lenderRedeemRewardsByTranche(i, toWithdraws[i]);
        }
    }

    /* VIEWS */

    /// @notice weighted APR
    function lenderTotalAprWad(address lenderAddress) public view returns (uint) {
        uint weightedApysWad = 0;
        uint totalAssets = 0;
        for (uint8 i; i < tranchesCount; ++i) {
            Rewardable storage rewardable = s_trancheRewardables[i][lenderAddress];
            totalAssets += rewardable.stakedAssets;
            weightedApysWad += (lenderEffectiveAprByTrancheWad(lenderAddress, i) * rewardable.stakedAssets);
        }

        if (totalAssets == 0) {
            return 0;
        }

        return weightedApysWad / totalAssets;
    }

    // @notice  Returns amount of stablecoins deposited across all the pool tranches by a lender;
    function lenderAllDepositedAssets(address lenderAddress) public view returns (uint totalAssets) {
        totalAssets = 0;
        for (uint8 i; i < tranchesCount; ++i) {
            totalAssets += s_trancheRewardables[i][lenderAddress].stakedAssets;
        }
    }

    /* VIEWS BY TRANCHE*/

    // @notice  Returns amount of stablecoins deposited to a pool tranche by a lender
    function lenderDepositedAssetsByTranche(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].stakedAssets;
    }

    function lenderTotalExpectedRewardsByTranche(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return (
            lenderDepositedAssetsByTranche(lenderAddress, trancheId) *
            lenderEffectiveAprByTrancheWad(lenderAddress, trancheId) *
            lendingTermSeconds
        ) / (YEAR * WAD);
    }

    function lenderRewardsByTrancheGeneratedByDate(address lenderAddress, uint8 trancheId) public view returns (uint) {
        if (fundedAt > block.timestamp) {
            return 0;
        }
        uint64 secondsElapsed = uint64(block.timestamp) - fundedAt;
        if (secondsElapsed > lendingTermSeconds) {
            secondsElapsed = lendingTermSeconds;
        }
        return (
            lenderDepositedAssetsByTranche(lenderAddress, trancheId) *
            lenderEffectiveAprByTrancheWad(lenderAddress, trancheId) *
            secondsElapsed
        ) / (YEAR * WAD);
    }

    function lenderRewardsByTrancheRedeemed(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].redeemedRewards;
    }

    function lenderRewardsByTrancheRedeemable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return
            lenderRewardsByTrancheGeneratedByDate(lenderAddress, trancheId) -
            lenderRewardsByTrancheRedeemed(lenderAddress, trancheId);
    }

    /** @notice As tranches can be partly boosted by platform tokens,
     *  this will return the effective APR taking into account all the deposited USDC + platform tokens
     */
    function lenderEffectiveAprByTrancheWad(address lenderAddress, uint8 trancheId) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        if (r.stakedAssets == 0) {
            return 0;
        }
        uint boostedAssets = r.lockedPlatformTokens / trancheBoostRatios[trancheId];
        /// @dev prevent more APRs than stakedAssets allow
        if (boostedAssets > r.stakedAssets) {
            boostedAssets = r.stakedAssets;
        }
        uint unBoostedAssets = r.stakedAssets - boostedAssets;
        uint weightedAverage = (unBoostedAssets *
            trancheAPRsWads[trancheId] +
            boostedAssets *
            trancheBoostedAPRsWads[trancheId]) / r.stakedAssets;
        return weightedAverage;
    }

    function lenderPlatformTokensByTrancheLocked(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].lockedPlatformTokens;
    }

    function lenderPlatformTokensByTrancheLockable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        uint maxLockablePlatformTokens = r.stakedAssets * trancheBoostRatios[trancheId];
        return maxLockablePlatformTokens - r.lockedPlatformTokens;
    }

    /*///////////////////////////////////
       Rollover settings
    ///////////////////////////////////*/
    struct RollOverSetting {
        bool enabled;
        bool principal;
        bool rewards;
        bool platformTokens;
    }

    mapping(address => RollOverSetting) private s_rollOverSettings;

    function lenderEnableRollOver(bool principal, bool rewards, bool platformTokens) external onlyLender {
        s_rollOverSettings[_msgSender()] = RollOverSetting(
            true,
            principal,
            rewards,
            platformTokens
        );
    }

    function lenderDisableRollOver() external onlyLender {
        s_rollOverSettings[_msgSender()] = RollOverSetting(
            false,
            false,
            false,
            false
        );
    }

    function lenderRollOverSettings(address lender) external view returns(RollOverSetting memory) {
        return s_rollOverSettings[lender];
    }

    /*///////////////////////////////////
       Borrower functions
       Error group: 2
    ///////////////////////////////////*/
    function borrowerDepositFirstLossCapital() external onlyPoolBorrower() atStage(Stages.INITIAL) {
        SafeERC20Upgradeable.safeTransferFrom(
            _stableCoinContract(),
            msg.sender,
            address(this),
            firstLossAssets
        );
        _transitionToFlcDepositedStage(firstLossAssets);
    }

    function borrow() external onlyPoolBorrower {
        SafeERC20Upgradeable.safeTransfer(
            _stableCoinContract(),
            borrowerAddress,
            collectedAssets
        );
        _transitionToBorrowedStage(collectedAssets);
    }

    function borrowerPayInterest(uint assets) external onlyPoolBorrower {
        uint penalty = borrowerPenaltyAmount();
        require(penalty < assets, "LP201"); // "LendingPool: penalty cannot be more than assets"

        if (penalty > 0) {
            uint balanceDifference = poolBalanceThreshold() - poolBalance();
            require(assets >= penalty + balanceDifference, "LP202"); // "LendingPool: penalty+interest will not bring pool to healthy state"
        }

        uint assetsToSendToFeeSharing = assets * protocolFeeWad / WAD + penalty;

        uint assetsForLenders = assets - assetsToSendToFeeSharing;

        SafeERC20Upgradeable.safeTransferFrom(
            _stableCoinContract(),
            _msgSender(),
            address(this),
            assets
        );

        SafeERC20Upgradeable.safeTransfer(
            _stableCoinContract(),
            feeSharingContractAddress,
            assetsToSendToFeeSharing
        );

        if (penalty > 0) {
            SafeERC20Upgradeable.safeTransfer(
                _stableCoinContract(),
                feeSharingContractAddress,
                penalty
            );
            emit BorrowerPayPenalty(_msgSender(), penalty);
        }

        borrowerInterestRepaid = borrowerInterestRepaid + assets - penalty;
        emit BorrowerPayInterest(borrowerAddress, assets, assetsForLenders, assetsToSendToFeeSharing);
    }

    function borrowerRepayPrincipal() external onlyPoolBorrower {
        SafeERC20Upgradeable.safeTransferFrom(
            _stableCoinContract(),
            _msgSender(),
            address(this),
            borrowedAssets
        );
        for (uint i; i < tranchesCount; ++i) {
            TrancheVault tv = _trancheVaultContracts()[i];
            SafeERC20Upgradeable.safeTransfer(
                _stableCoinContract(),
                address(tv),
                tv.totalAssets()
            );
            tv.enableWithdrawals();
        }
        _transitionToPrincipalRepaidStage(borrowedAssets);
    }

    /* VIEWS */
    function poolBalanceThreshold() public view returns (uint) {
        return firstLossAssets - (repaymentRecurrenceDays + gracePeriodDays) * _dailyInterestAmount();
    }

    function poolBalance() public view returns (uint) {
        return _stableCoinContract().balanceOf(address(this));
    }

    function borrowerPenaltyAmount() public view returns (uint) {
        if (poolBalance() >= poolBalanceThreshold()) {
            return 0;
        }

        uint balanceDifference = poolBalanceThreshold() - poolBalance();
        uint daysUnpaid = balanceDifference / _dailyInterestAmount();

        if (daysUnpaid == 0) {
            return 0;
        }

        uint penaltyCoefficientWad = WAD;
        for(uint i; i < daysUnpaid; ++i) {
            penaltyCoefficientWad = penaltyCoefficientWad * (WAD + penaltyRateWad()) / WAD;
        }
        uint penalty = balanceDifference * penaltyCoefficientWad / WAD - balanceDifference;
        return penalty;
    }

    /** @dev total interest to be paid by borrower = adjustedBorrowerAPR * collectedAssets
     *  @return interest amount of assets to be repaid
     */
    function borrowerExpectedInterest() public view returns (uint) {
        return (collectedAssets * borrowerAdjustedInterestRateWad()) / WAD;
    }

    /** @dev outstanding borrower interest = expectedBorrowerInterest - borrowerInterestAlreadyPaid
     *  @return interest amount of outstanding assets to be repaid
     */
    function borrowerOutstandingInterest() public view returns (uint) {
        if (borrowerInterestRepaid > borrowerExpectedInterest() ) {
            return 0;
        }
        return borrowerExpectedInterest() - borrowerInterestRepaid;
    }

    function borrowerExcessSpread() public view returns (uint) {
        if (borrowerOutstandingInterest() > 0) {
            return 0;
        }
        return borrowerInterestRepaid - borrowerExpectedInterest();
    }

    /** @dev adjusted borrower interest rate = APR * duration / 365 days
     *  @return adj borrower interest rate adjusted by duration of the loan
     */
    function borrowerAdjustedInterestRateWad() public view returns (uint adj) {
        adj = (borrowerTotalInterestRateWad * lendingTermSeconds) / YEAR;
    }

    /*///////////////////////////////////
       COMMUNICATION WITH VAULTS
       Error group: 3
    ///////////////////////////////////*/

    /// @dev TrancheVault will call that callback function when a lender deposits assets
    function onTrancheDeposit(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) {
        // 1. find / create the rewardable
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
    }

    /// @dev TrancheVault will call that callback function when a lender withdraws assets
    function onTrancheWithdraw(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) {
        require(!s_rollOverSettings[depositorAddress].principal, "LP301"); // "LendingPool: principal locked for rollover"

        if (currentStage() == Stages.REPAID) {
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
    }

    /*///////////////////////////////////
       HELPERS
    ///////////////////////////////////*/

    function _dailyInterestAmount() internal view returns (uint) {
        return (borrowedAssets * borrowerTotalInterestRateWad) / (WAD * 365);
    }

    function _trancheVaultContracts() internal view returns (TrancheVault[] memory contracts) {
        address[] memory addresses = trancheVaultAddresses;
        contracts = new TrancheVault[](addresses.length);

        for (uint i; i < addresses.length; ++i) {
            contracts[i] = TrancheVault(addresses[i]);
        }
    }

    /// @notice average APR of all lenders across all tranches, boosted or not
    function allLendersEffectiveAprWad() public view returns (uint) {
        uint weightedSum = 0;
        uint totalStakedAssets = 0;
        for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
            uint stakedAssets = s_totalStakedAssetsByTranche[trancheId];
            totalStakedAssets += stakedAssets;

            uint boostedAssets = s_totalLockedPlatformTokensByTranche[trancheId] / trancheBoostRatios[trancheId];
            if (boostedAssets > stakedAssets) {
                boostedAssets = stakedAssets;
            }
            uint unBoostedAssets = stakedAssets - boostedAssets;

            weightedSum += unBoostedAssets * trancheAPRsWads[trancheId];
            weightedSum += boostedAssets * trancheBoostedAPRsWads[trancheId];
        }

        return weightedSum / totalStakedAssets;
    }

    /* approximation of (1+x)^n using taylor series */
    // function taylorOnePlusXtoThePowerOfNWad(uint256 xWad, uint256 n) public pure returns (uint256) {
    //     uint MAX_ITERATIONS = 7;
    //     uint result = WAD;
    //     uint term = WAD;

    //     uint iterationsCount = n > MAX_ITERATIONS ? MAX_ITERATIONS : n;

    //     for(uint i = 1; i <= iterationsCount; ++i) {
    //         term = term * (n-i+1) * xWad / (i * WAD);
    //         result += term;
    //     }

    //     return result;
    // }

    // /** @dev fast (O(log n)) algorithm for multiplying x(WAD) to the power of n (n is not wad). Exponentiation by squaring */
    // // TODO: does not work. WTF?
    // function wadPow(uint256 _xWad, uint256 _n) public pure returns (uint256) {
    //     uint xWad = _xWad;
    //     uint n = _n;

    //     uint result = n % 2 != 0 ? xWad : WAD;

    //     for(n /= 2; n != 0; n /= 2) {
    //         xWad = (xWad * xWad) / WAD;
    //         if (n % 2 != 0) {
    //             result = (result * xWad) / WAD;
    //         }
    //     }

    //     return result;
    // }

    function _emitLenderTrancheRewardsChange(address lenderAddress, uint8 trancheId) internal {
        emit LenderTrancheRewardsChange(
            lenderAddress,
            trancheId,
            lenderEffectiveAprByTrancheWad(lenderAddress, trancheId),
            lenderTotalExpectedRewardsByTranche(lenderAddress, trancheId),
            lenderRewardsByTrancheGeneratedByDate(lenderAddress, trancheId),
            lenderRewardsByTrancheRedeemed(lenderAddress, trancheId),
            lenderRewardsByTrancheRedeemable(lenderAddress, trancheId)
        );
    }

    function _stableCoinContract() internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(stableCoinContractAddress);
    }
}
