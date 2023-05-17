// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./LendingPoolState.sol";
import "../vaults/TrancheVault.sol";
import "../fee_sharing/IFeeSharing.sol";
import "hardhat/console.sol";

contract LendingPool is ILendingPool, Initializable, AuthorityAware, PausableUpgradeable, LendingPoolState {
    using EnumerableSet for EnumerableSet.AddressSet;
    using MathUpgradeable for uint;

    /*///////////////////////////////////
       CONSTANTS
    ///////////////////////////////////*/
    uint internal constant WAD = 10 ** 18;
    uint internal constant YEAR = 365 * 24 * 60 * 60;

    enum Stages {
        INITIAL,
        OPEN,
        FUNDED,
        FUNDING_FAILED,
        FLC_DEPOSITED,
        BORROWED,
        BORROWER_INTEREST_REPAID,
        DILINQUENT,
        REPAID,
        DEFAULTED
    }

    /*///////////////////////////////////
       MODIFIERS
    ///////////////////////////////////*/
    modifier authTrancheVault(uint8 id) {
        require(id < trancheVaultAddresses().length, "LendingPool: invalid trancheVault id");
        require(trancheVaultAddresses()[id] == _msgSender(), "LendingPool: trancheVault auth");
        _;
    }

    modifier onlyPoolBorrower() {
        require(_msgSender() == borrowerAddress(), "LendingPool: not a borrower");
        _;
    }

    modifier atStage(Stages _stage) {
        require(currentStage() == _stage, "LendingPool: not at correct stage");
        _;
    }

    modifier atStages2(Stages _stage1, Stages _stage2) {
        require(currentStage() == _stage1 || currentStage() == _stage2, "LendingPool: not at correct stage");
        _;
    }

    modifier atStages3(
        Stages _stage1,
        Stages _stage2,
        Stages _stage3
    ) {
        require(
            currentStage() == _stage1 || currentStage() == _stage2 || currentStage() == _stage3,
            "LendingPool: not at correct stage"
        );
        _;
    }

    /*///////////////////////////////////
       EVENTS
    ///////////////////////////////////*/

    // State Changes //
    event PoolOpen(address indexed actor);
    event PoolFunded();
    event PoolFundingFailed();
    event PoolRepaid();
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
    event BorrowerRepayPrincipal(address indexed borrower, uint amount);

    /*///////////////////////////////////
       INITIALIZATION
    ///////////////////////////////////*/

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
        uint borrowerTotalInterestRateWad;
        uint collateralRatioWad;
        uint protocolFeeWad;
        uint defaultPenalty;
        uint penaltyRateWad;
        uint8 tranchesCount;
        uint[] trancheAPRsWads;
        uint[] trancheBoostedAPRsWads;
        uint[] trancheBoostRatios;
        uint[] trancheCoveragesWads;
    }

    function initialize(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    ) external initializer {
        _validateInitParams(params, _trancheVaultAddresses, _feeSharingContractAddress, _authorityAddress);

        _setName(params.name);
        _setToken(params.token);
        _setStableCoinContractAddress(params.stableCoinContractAddress);
        _setPlatformTokenContractAddress(params.platformTokenContractAddress);
        _setMinFundingCapacity(params.minFundingCapacity);
        _setMaxFundingCapacity(params.maxFundingCapacity);
        _setFundingPeriodSeconds(params.fundingPeriodSeconds);
        _setLendingTermSeconds(params.lendingTermSeconds);
        _setBorrowerAddress(params.borrowerAddress);
        _setBorrowerTotalInterestRateWad(params.borrowerTotalInterestRateWad);
        _setCollateralRatioWad(params.collateralRatioWad);
        _setProtocolFeeWad(params.protocolFeeWad);
        _setDefaultPenalty(params.defaultPenalty);
        _setPenaltyRateWad(params.penaltyRateWad);
        _setTranchesCount(params.tranchesCount);
        _setTrancheAPRsWads(params.trancheAPRsWads);
        _setTrancheBoostedAPRsWads(params.trancheBoostedAPRsWads);
        _setTrancheBoostRatios(params.trancheBoostRatios);
        _setTrancheCoveragesWads(params.trancheCoveragesWads);

        _setTrancheVaultAddresses(_trancheVaultAddresses);
        _setFeeSharingContractAddress(_feeSharingContractAddress);

        __Ownable_init();
        __Pausable_init();
        __AuthorityAware__init(_authorityAddress);
    }

    /// @dev validates initializer params
    function _validateInitParams(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _feeSharingContractAddress,
        address _authorityAddress
    ) internal pure {
        require(params.stableCoinContractAddress != address(0), "LendingPool: stableCoinContractAddress empty");

        require(params.minFundingCapacity > 0, "LendingPool: minFundingCapacity == 0");
        require(params.maxFundingCapacity > 0, "LendingPool: maxFundingCapacity == 0");
        require(
            params.maxFundingCapacity >= params.minFundingCapacity,
            "LendingPool: maxFundingCapacity < minFundingCapacity"
        );

        require(params.fundingPeriodSeconds > 0, "LendingPool: fundingPeriodSeconds == 0");
        require(params.lendingTermSeconds > 0, "LendingPool: lendingTermSeconds == 0");
        require(params.borrowerAddress != address(0), "LendingPool: borrowerAddress empty");
        require(params.borrowerTotalInterestRateWad > 0, "LendingPool: borrower interest rate = 0%");
        require(params.collateralRatioWad > 0, "LendingPool: collateralRatio == 0%");
        require(params.protocolFeeWad > 0, "LendingPool: protocolFee == 0%");
        require(params.penaltyRateWad > 0, "LendingPool: penaltyRate == 0");

        require(params.tranchesCount > 0, "LendingPool: tranchesCount == 0");
        require(_trancheVaultAddresses.length == params.tranchesCount, "LendingPool: trancheAddresses length");
        require(params.trancheAPRsWads.length == params.tranchesCount, "LendingPool: tranche APRs length");
        require(
            params.trancheBoostedAPRsWads.length == params.tranchesCount,
            "LendingPool: tranche Boosted APRs length"
        );
        require(
            params.trancheBoostedAPRsWads.length == params.tranchesCount,
            "LendingPool: tranche Coverage APRs length"
        );

        for (uint i; i < params.tranchesCount; ++i) {
            require(params.trancheAPRsWads[i] > 0, "tranche APRs == 0");
            require(
                params.trancheBoostedAPRsWads[i] >= params.trancheAPRsWads[i],
                "LendingPool: tranche boosted APRs < tranche APRs"
            );
        }

        require(_feeSharingContractAddress != address(0), "LendingPool: feeSharingAddress empty");
        require(_authorityAddress != address(0), "LendingPool: authorityAddress empty");
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
        if (repaidAt() != 0) {
            return Stages.REPAID;
        }
        if (borrowedAt() != 0) {
            return Stages.BORROWED;
        }
        if (fundingFailedAt() != 0) {
            return Stages.FUNDING_FAILED;
        }
        if (fundedAt() != 0) {
            return Stages.FUNDED;
        }
        if (openedAt() != 0) {
            return Stages.OPEN;
        }

        return Stages.INITIAL;
    }

    /** @notice Marks the pool as opened. This function has to be called by *owner* when
     * - sets openedAt to current block timestamp
     * - enables deposits and withdrawals to tranche vaults
     */
    function adminOpenPool() external onlyWhitelisted atStage(Stages.INITIAL) {
        for (uint i; i < trancheVaultAddresses().length; i++) {
            _trancheVaultContracts()[i].enableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        _setOpenedAt(uint64(block.timestamp));
        emit PoolOpen(_msgSender());
    }

    /** @notice Checks whether the pool was funded successfully or not.
     *  this function is expected to be called by *owner* once the funding period ends
     */
    function adminTransitionToFundedState() external onlyOwnerOrAdmin atStage(Stages.OPEN) {
        if (collectedAssets() >= minFundingCapacity()) {
            _transitionToFundedStage();
        } else {
            _transitionToFundingFailedStage();
        }
    }

    function _transitionToFundedStage() internal {
        _setFundedAt(uint64(block.timestamp));

        for (uint i; i < _trancheVaultContracts().length; i++) {
            TrancheVault tv = _trancheVaultContracts()[i];
            tv.disableDeposits();
            tv.disableWithdrawals();
            tv.sendAssetsToPool(tv.totalAssets());
        }

        emit PoolFunded();
    }

    function _transitionToFundingFailedStage() internal {
        _setFundingFailedAt(uint64(block.timestamp));
        for (uint i; i < trancheVaultAddresses().length; i++) {
            _trancheVaultContracts()[i].disableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        emit PoolFundingFailed();
    }

    function _transitionToFlcDepositedStage(uint flcAssets) internal {
        _setFlcDepositedAt(uint64(block.timestamp));
        emit BorrowerDepositFirstLossCapital(borrowerAddress(), flcAssets);
    }

    function _transitionToBorrowedStage(uint amountToBorrow) internal {
        _setBorrowedAt(uint64(block.timestamp));
        _setBorrowedAssets(amountToBorrow);

        emit BorrowerBorrow(borrowerAddress(), amountToBorrow);
    }

    function _transitionToPrincipalRepaidStage(uint repaidPrincipal) internal {
        _setRepaidAt(uint64(block.timestamp));
        emit BorrowerRepayPrincipal(borrowerAddress(), repaidPrincipal);
        emit PoolRepaid();
    }

    /*///////////////////////////////////
      Lender (please also see onTrancheDeposit() and onTrancheWithdraw())
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
            "LendingPool: lock will lead to overboost"
        );
        Rewardable storage r = s_trancheRewardables[trancheId][_msgSender()];
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(platformTokenContractAddress()),
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
        require(lenderRewardsByTrancheRedeemable(_msgSender(), trancheId) == 0, "LendingPool: rewards not redeemed");

        Rewardable storage r = s_trancheRewardables[trancheId][_msgSender()];

        require(r.lockedPlatformTokens >= platformTokens, "LendingPool: not enough locked tokens");
        r.lockedPlatformTokens -= platformTokens;
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(platformTokenContractAddress()),
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
        if (toWithdraw == 0) {
            return;
        }
        uint maxWithdraw = lenderRewardsByTrancheRedeemable(_msgSender(), trancheId);
        require(toWithdraw < maxWithdraw, "LendingPool: amount to withdraw is too big");
        s_trancheRewardables[trancheId][_msgSender()].redeemedRewards += toWithdraw;

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(stableCoinContractAddress()), _msgSender(), toWithdraw);

        emit LenderWithdrawInterest(_msgSender(), trancheId, toWithdraw);
        _emitLenderTrancheRewardsChange(_msgSender(), trancheId);
    }

    /** @notice Redeem currently available rewards for two tranches
     *  @param toWithdraws amount of rewards to withdraw accross all tranches
     */
    function lenderRedeemRewards(
        uint[] calldata toWithdraws
    ) external onlyLender atStages3(Stages.BORROWED, Stages.BORROWER_INTEREST_REPAID, Stages.REPAID) {
        require(toWithdraws.length == tranchesCount(), "LendingPool: wrong amount of tranches");
        for(uint8 i; i < toWithdraws.length; i++) {
            lenderRedeemRewardsByTranche(i, toWithdraws[i]);
        }
    }

    /* VIEWS */

    /// @notice weighted APR
    function lenderTotalAprWad(address lenderAddress) public view returns (uint) {
        uint weightedApysWad = 0;
        uint totalAssets = 0;
        for (uint8 i; i < tranchesCount(); ++i) {
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
        for (uint8 i; i < tranchesCount(); ++i) {
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
            lendingTermSeconds()
        ) / (YEAR * WAD);
    }

    function lenderRewardsByTrancheGeneratedByDate(address lenderAddress, uint8 trancheId) public view returns (uint) {
        if (fundedAt() > block.timestamp) {
            return 0;
        }
        uint64 secondsElapsed = uint64(block.timestamp) - fundedAt();
        if (secondsElapsed > lendingTermSeconds()) {
            secondsElapsed = lendingTermSeconds();
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
        uint boostedAssets = r.lockedPlatformTokens / trancheBoostRatios()[trancheId];
        /// @dev prevent more APRs than stakedAssets allow
        if (boostedAssets > r.stakedAssets) {
            boostedAssets = r.stakedAssets;
        }
        uint unBoostedAssets = r.stakedAssets - boostedAssets;
        uint weightedAverage = (unBoostedAssets *
            trancheAPRsWads()[trancheId] +
            boostedAssets *
            trancheBoostedAPRsWads()[trancheId]) / r.stakedAssets;
        return weightedAverage;
    }

    function lenderPlatformTokensByTrancheLocked(address lenderAddress, uint8 trancheId) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].lockedPlatformTokens;
    }

    function lenderPlatformTokensByTrancheLockable(address lenderAddress, uint8 trancheId) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        uint maxLockablePlatformTokens = r.stakedAssets * trancheBoostRatios()[trancheId];
        return maxLockablePlatformTokens - r.lockedPlatformTokens;
    }

    /*///////////////////////////////////
       Borrower functions
    ///////////////////////////////////*/
    function borrow() external onlyPoolBorrower {
        uint firstLossCapitalDepositTarget = (collectedAssets() * collateralRatioWad()) / WAD;
        uint amountToBorrow = collectedAssets() - firstLossCapitalDepositTarget;
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(stableCoinContractAddress()),
            borrowerAddress(),
            amountToBorrow
        );
        // NOTE: the flc stays on the contract itself
        _transitionToFlcDepositedStage(firstLossCapitalDepositTarget);
        _transitionToBorrowedStage(amountToBorrow);
    }

    function borrowerPayInterest(uint assets) external onlyPoolBorrower {
        uint assetsToSendToFeeSharing = assets * protocolFeeWad() / WAD;
        uint assetsForLenders = assets - assetsToSendToFeeSharing;

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(stableCoinContractAddress()),
            _msgSender(),
            address(this),
            assets
        );

        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(stableCoinContractAddress()),
            feeSharingContractAddress(),
            assetsToSendToFeeSharing
        );

        _setBorrowerInterestRepaid(borrowerInterestRepaid() + assets);
        emit BorrowerPayInterest(borrowerAddress(), assets, assetsForLenders, assetsToSendToFeeSharing);
    }

    function borrowerRepayPrincipal() external onlyPoolBorrower {
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(stableCoinContractAddress()),
            _msgSender(),
            address(this),
            borrowedAssets()
        );
        for (uint i; i < tranchesCount(); ++i) {
            TrancheVault tv = _trancheVaultContracts()[i];
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(stableCoinContractAddress()),
                address(tv),
                tv.totalAssets()
            );
            tv.enableWithdrawals();
        }
        _transitionToPrincipalRepaidStage(borrowedAssets());
    }

    /* VIEWS */

    /** @dev total interest to be paid by borrower = adjustedBorrowerAPR * collectedAssets
     *  @return interest amount of assets to be repaid
     */
    function borrowerExpectedInterest() public view returns (uint) {
        return (collectedAssets() * borrowerAdjustedInterestRateWad()) / WAD;
    }

    /** @dev outstanding borrower interest = expectedBorrowerInterest - borrowerInterestAlreadyPaid
     *  @return interest amount of outstanding assets to be repaid
     */
    function borrowerOutstandingInterest() public view returns (uint) {
        return borrowerExpectedInterest() - borrowerInterestRepaid();
    }

    /** @dev adjusted borrower interest rate = APR * duration / 365 days
     *  @return adj borrower interest rate adjusted by duration of the loan
     */
    function borrowerAdjustedInterestRateWad() public view returns (uint adj) {
        adj = (borrowerTotalInterestRateWad() * lendingTermSeconds()) / YEAR;
    }

    /*///////////////////////////////////
       COMMUNICATION WITH VAULTS
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
        _setCollectedAssets(collectedAssets() + amount);
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
        if (currentStage() == Stages.REPAID) {
            emit LenderWithdraw(depositorAddress, trancheId, amount);
        } else {
            Rewardable storage rewardable = s_trancheRewardables[trancheId][depositorAddress];

            assert(rewardable.stakedAssets >= amount);

            rewardable.stakedAssets -= amount;
            _setCollectedAssets(collectedAssets() - amount);
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
        address[] memory addresses = trancheVaultAddresses();
        contracts = new TrancheVault[](addresses.length);

        for (uint i; i < addresses.length; ++i) {
            contracts[i] = TrancheVault(addresses[i]);
        }
    }

    /// @notice average APR of all lenders across all tranches, boosted or not
    function allLendersEffectiveAprWad() public view returns (uint) {
        uint weightedSum = 0;
        uint totalStakedAssets = 0;
        for (uint8 trancheId; trancheId < tranchesCount(); trancheId++) {
            uint stakedAssets = s_totalStakedAssetsByTranche[trancheId];
            totalStakedAssets += stakedAssets;

            uint boostedAssets = s_totalLockedPlatformTokensByTranche[trancheId] / trancheBoostRatios()[trancheId];
            if (boostedAssets > stakedAssets) {
                boostedAssets = stakedAssets;
            }
            uint unBoostedAssets = stakedAssets - boostedAssets;

            weightedSum += unBoostedAssets * trancheAPRsWads()[trancheId];
            weightedSum += boostedAssets * trancheBoostedAPRsWads()[trancheId];
        }

        return weightedSum / totalStakedAssets;
    }

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
}
