// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./LendingPoolState.sol";
import "../vaults/TrancheVault.sol";
import "../fee_sharing/IFeeSharing.sol";

contract LendingPool is ILendingPool, Initializable, AuthorityAware, PausableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathUpgradeable for uint;

    /*///////////////////////////////////
       CONSTANTS
    ///////////////////////////////////*/
    string public constant VERSION = "2023-05-26";

    uint internal constant WAD = 10 ** 18;
    uint internal constant DAY = 24 * 60 * 60;
    uint internal constant YEAR = 365 * DAY;

    struct Rewardable {
        uint stakedAssets;
        uint lockedPlatformTokens;
        uint redeemedRewards;
        uint64 start;
    }

    struct RollOverSetting {
        bool enabled;
        bool principal;
        bool rewards;
        bool platformTokens;
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
        DEFAULTED,
        FLC_WITHDRAWN
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
    address public poolFactoryAddress;
    address public feeSharingContractAddress;
    address[] public trancheVaultAddresses;
    /* Some Timestamps */
    uint64 public openedAt;
    uint64 public fundedAt;
    uint64 public fundingFailedAt;
    uint64 public flcDepositedAt;
    uint64 public borrowedAt;
    uint64 public repaidAt;
    uint64 public flcWithdrawntAt;

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

    /// @dev lenderAddress => RollOverSetting
    mapping(address => RollOverSetting) private s_rollOverSettings;

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
        require(id < trancheVaultAddresses.length, "LP001"); // "LendingPool: invalid trancheVault id"
        require(trancheVaultAddresses[id] == _msgSender(), "LP002"); // "LendingPool: trancheVault auth"
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

    function initialize(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress,
        address _poolFactoryAddress
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
        poolFactoryAddress = _poolFactoryAddress;

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

        // TODO: confirm and check that trancheBoostedAPR + protocolFee <= borrowerInterest

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
        if (flcWithdrawntAt != 0) {
            return Stages.FLC_WITHDRAWN;
        }
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
        emit PoolOpen(openedAt);
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

        emit PoolFunded(fundedAt, collectedAssets);
    }

    function _transitionToFundingFailedStage() internal {
        fundingFailedAt = uint64(block.timestamp);

        for (uint i; i < trancheVaultAddresses.length; i++) {
            _trancheVaultContracts()[i].disableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        emit PoolFundingFailed(fundingFailedAt);
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
        emit PoolRepaid(repaidAt);
    }

    function _transitionToFlcWithdrawnStage(uint flcAssets) internal {
        flcWithdrawntAt = uint64(block.timestamp);
        emit BorrowerWithdrawFirstLossCapital(borrowerAddress, flcAssets);
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
    ) external onlyLender atStages2(Stages.REPAID, Stages.FLC_WITHDRAWN) {
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
    ) public onlyLender atStages3(Stages.BORROWED, Stages.REPAID, Stages.FLC_WITHDRAWN) {
        require(!s_rollOverSettings[msg.sender].rewards, "LP105"); // "LendingPool: rewards are locked for rollover"
        if (toWithdraw == 0) {
            return;
        }
        uint maxWithdraw = lenderRewardsByTrancheRedeemable(_msgSender(), trancheId);
        require(toWithdraw <= maxWithdraw, "LP106"); // "LendingPool: amount to withdraw is too big"
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
    ) external onlyLender atStages3(Stages.BORROWED, Stages.REPAID, Stages.FLC_WITHDRAWN) {
        require(!s_rollOverSettings[msg.sender].rewards, "LP105"); //"LendingPool: rewards are locked for rollover"
        require(toWithdraws.length == tranchesCount, "LP107"); //"LendingPool: wrong amount of tranches"
        for(uint8 i; i < toWithdraws.length; i++) {
            lenderRedeemRewardsByTranche(i, toWithdraws[i]);
        }
    }

    /* VIEWS */

    /// @notice average APR of all lenders across all tranches, boosted or not
    function allLendersInterest() public view returns (uint) {
        return allLendersEffectiveAprWad() * collectedAssets / WAD * lendingTermSeconds / YEAR;
    }

    function allLendersInterestByDate() public view returns (uint) {
        if (fundedAt == 0 || block.timestamp <= fundedAt) {
            return 0;
        }
        uint time = block.timestamp < fundedAt + lendingTermSeconds ? block.timestamp : fundedAt + lendingTermSeconds;
        uint elapsedTime = time - fundedAt;
        return allLendersInterest() * elapsedTime / lendingTermSeconds;
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

    /// @notice weighted APR accross all the lenders
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

    /// @notice  Returns amount of stablecoins deposited across all the pool tranches by a lender
    function lenderAllDepositedAssets(address lenderAddress) public view returns (uint totalAssets) {
        totalAssets = 0;
        for (uint8 i; i < tranchesCount; ++i) {
            totalAssets += s_trancheRewardables[i][lenderAddress].stakedAssets;
        }
    }

    /* VIEWS BY TRANCHE*/

    /** @notice  Returns amount of stablecoins deposited to a pool tranche by a lender
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderDepositedAssetsByTranche(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].stakedAssets;
    }

    /** @notice Returns amount of stablecoins to be paid for the lender by the end of the pool term.
     *  `lenderAPR * lenderDepositedAssets * lendingTermSeconds / YEAR`
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderTotalExpectedRewardsByTranche(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return (
            lenderDepositedAssetsByTranche(lenderAddress, trancheId) *
            lenderEffectiveAprByTrancheWad(lenderAddress, trancheId) *
            lendingTermSeconds
        ) / (YEAR * WAD);
    }

    /** @notice Returns amount of stablecoin rewards generated for the lenders by current second.
     *  `lenderTotalExpectedRewardsByTranche * (secondsElapsed / lendingTermSeconds)`
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
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

    /** @notice Returns amount of stablecoin rewards that has been withdrawn by the lender.
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderRewardsByTrancheRedeemed(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].redeemedRewards;
    }

    /** @notice Returns amount of stablecoin rewards that can be withdrawn by the lender. (generated - redeemed)
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderRewardsByTrancheRedeemable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return
            lenderRewardsByTrancheGeneratedByDate(lenderAddress, trancheId) -
            lenderRewardsByTrancheRedeemed(lenderAddress, trancheId);
    }

    /** @notice Returns APR for the lender taking into account all the deposited USDC + platform tokens
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
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

    /** @notice Returns amount of platform tokens locked by the lender
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderPlatformTokensByTrancheLocked(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].lockedPlatformTokens;
    }

    /** @notice Returns amount of platform tokens that lender can lock in order to boost their APR
     *  @param lenderAddress lender address
     *  @param trancheId tranche id
     */
    function lenderPlatformTokensByTrancheLockable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        uint maxLockablePlatformTokens = r.stakedAssets * trancheBoostRatios[trancheId];
        return maxLockablePlatformTokens - r.lockedPlatformTokens;
    }

    /*///////////////////////////////////
       Rollover settings
    ///////////////////////////////////*/
    /** @notice marks the intent of the lender to roll over their capital to the upcoming pool
     *  if you opt to roll over you will not be able to withdraw stablecoins / platform tokens from the pool
     *  @param principal whether the principal should be rolled over
     *  @param rewards whether the rewards should be rolled over
     *  @param platformTokens whether the platform tokens should be rolled over
     */
    function lenderEnableRollOver(bool principal, bool rewards, bool platformTokens) external onlyLender {
        s_rollOverSettings[_msgSender()] = RollOverSetting(
            true,
            principal,
            rewards,
            platformTokens
        );
    }

    /** @notice cancels lenders intent to roll over the funds to the next pool.
     */
    function lenderDisableRollOver() external onlyLender {
        s_rollOverSettings[_msgSender()] = RollOverSetting(
            false,
            false,
            false,
            false
        );
    }

    /** @notice returns lender's roll over settings
     *  @param lender lender address
    */
    function lenderRollOverSettings(address lender) external view returns(RollOverSetting memory) {
        return s_rollOverSettings[lender];
    }

    /*///////////////////////////////////
       Borrower functions
       Error group: 2
    ///////////////////////////////////*/
    /** @notice Deposits first loss capital into the pool
     *  should be called by the borrower before the pool can start
     */
    function borrowerDepositFirstLossCapital() external onlyPoolBorrower() atStage(Stages.INITIAL) {
        SafeERC20Upgradeable.safeTransferFrom(
            _stableCoinContract(),
            msg.sender,
            address(this),
            firstLossAssets
        );
        _transitionToFlcDepositedStage(firstLossAssets);
    }

    /** @notice Borrows collected funds from the pool */
    function borrow() external onlyPoolBorrower atStage(Stages.FUNDED) {
        SafeERC20Upgradeable.safeTransfer(
            _stableCoinContract(),
            borrowerAddress,
            collectedAssets
        );
        _transitionToBorrowedStage(collectedAssets);
    }

    /** @notice Make an interest payment.
     *  If the pool is delinquent, the minimum payment is penalty + whatever interest that needs to be paid to bring the pool back to healthy state
     */
    function borrowerPayInterest(uint assets) external onlyPoolBorrower {
        uint penalty = borrowerPenaltyAmount();
        require(penalty < assets, "LP201"); // "LendingPool: penalty cannot be more than assets"

        if (penalty > 0) {
            uint balanceDifference = poolBalanceThreshold() - poolBalance();
            require(assets >= penalty + balanceDifference, "LP202"); // "LendingPool: penalty+interest will not bring pool to healthy state"
        }
        
        uint feeableInterestAmount = assets - penalty;
        if (feeableInterestAmount > borrowerOutstandingInterest()) {
            feeableInterestAmount = borrowerOutstandingInterest();
        }

        uint assetsToSendToFeeSharing = feeableInterestAmount * protocolFeeWad / WAD + penalty;
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
            emit BorrowerPayPenalty(_msgSender(), penalty);
        }

        borrowerInterestRepaid = borrowerInterestRepaid + assets - penalty;
        emit BorrowerPayInterest(borrowerAddress, assets, assetsForLenders, assetsToSendToFeeSharing);
    }

    /** @notice Repay principal
     *  can be called only after all interest is paid
     *  can be called only after all penalties are paid
     */
    function borrowerRepayPrincipal() external onlyPoolBorrower atStage(Stages.BORROWED) {
        require(borrowerOutstandingInterest() == 0, "LP203"); // "LendingPool: interest must be paid before repaying principal"
        require(borrowerPenaltyAmount() == 0, "LP204"); // "LendingPool: penalty must be paid before repaying principal"

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

    /** @notice Withdraw first loss capital and excess spread
     *  can be called only after principal is repaid
     */
    function borrowerWithdrawFirstLossCapitalAndExcessSpread() external onlyPoolBorrower atStage(Stages.REPAID) {
        uint assetsToSend = firstLossAssets + borrowerExcessSpread();
        SafeERC20Upgradeable.safeTransfer(
            _stableCoinContract(),
            borrowerAddress,
            assetsToSend
        );
        _transitionToFlcWithdrawnStage(assetsToSend);
    }

    /* VIEWS */
    /** @notice Pool balance threshold.
     *  if pool balance fallse below this threshold, the pool is considered delinquent and the borrower starts to face penalties.
     */
    function poolBalanceThreshold() public view returns (uint) {
        uint dailyBorrowerInterestAmount = borrowedAssets * borrowerTotalInterestRateWad / WAD / 365;
        return firstLossAssets - (repaymentRecurrenceDays + gracePeriodDays) * dailyBorrowerInterestAmount;
    }

    /** @notice Pool balance
     * First loss capital minus whatever rewards are generated for the lenders by date.
     */
    function poolBalance() public view returns (uint) {
        uint positiveBalance = firstLossAssets + borrowerInterestRepaid;
        if (allLendersInterestByDate() > positiveBalance) {
            return 0;
        }
        return positiveBalance - allLendersInterestByDate();
    }

    /** @notice how much penalty the borrower owes because of the delinquency fact */
    function borrowerPenaltyAmount() public view returns (uint) {
        if (poolBalance() >= poolBalanceThreshold()) {
            return 0;
        }

        uint dailyLendersInterestAmount = collectedAssets * allLendersEffectiveAprWad() / WAD / 365;
        uint balanceDifference = poolBalanceThreshold() - poolBalance();
        uint daysDelinquent = balanceDifference / dailyLendersInterestAmount;

        if (daysDelinquent == 0) {
            return 0;
        }

        uint penaltyCoefficientWad = _wadPow(WAD + penaltyRateWad, daysDelinquent);

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

    /** @notice excess spread = interest paid by borrower - interest paid to lenders - fees
     *  Once the pool ends, can be withdrawn by the borrower alongside the first loss capital
     */
    function borrowerExcessSpread() public view returns (uint) {
        if (borrowerOutstandingInterest() > 0) {
            return 0;
        }
        uint fees = borrowerExpectedInterest() * protocolFeeWad / WAD;
        return borrowerInterestRepaid - allLendersInterest() - fees;
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

        if (currentStage() == Stages.REPAID || currentStage() == Stages.FLC_WITHDRAWN) {
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

    function _trancheVaultContracts() internal view returns (TrancheVault[] memory contracts) {
        address[] memory addresses = trancheVaultAddresses;
        contracts = new TrancheVault[](addresses.length);

        for (uint i; i < addresses.length; ++i) {
            contracts[i] = TrancheVault(addresses[i]);
        }
    }

    
    function _emitLenderTrancheRewardsChange(address lenderAddress, uint8 trancheId) internal {
        emit LenderTrancheRewardsChange(
            lenderAddress,
            trancheId,
            lenderEffectiveAprByTrancheWad(lenderAddress, trancheId),
            lenderTotalExpectedRewardsByTranche(lenderAddress, trancheId),
            lenderRewardsByTrancheRedeemed(lenderAddress, trancheId)
        );
    }

    function _stableCoinContract() internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(stableCoinContractAddress);
    }

    /// @dev calculates WAD ** N using exponentiation by squaring algorithm.
    /// it's O(log(N) instead of O(N) for naive repeated multiplication.
    function _wadPow(uint _xWad, uint _n) internal pure returns(uint) {
        uint xWad = _xWad;
        uint n = _n;
        uint result = n % 2 != 0 ? xWad : WAD;

        for (n /= 2; n != 0; n /= 2) {
            xWad = (xWad * xWad) / WAD;

            if (n % 2 != 0) {
                result = (result * xWad) / WAD;
            }
        }

        return result;
    }
}
