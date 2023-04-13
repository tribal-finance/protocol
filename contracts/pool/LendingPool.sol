// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./ILendingPool.sol";
import "./LendingPoolState.sol";
import "../vaults/TrancheVault.sol";
import "../vaults/FirstLossCapitalVault.sol";

contract LendingPool is
    ILendingPool,
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    LendingPoolState
{
    using EnumerableSet for EnumerableSet.AddressSet;

    /*///////////////////////////////////
       CONSTANTS
    ///////////////////////////////////*/
    uint internal constant WAD = 10 ** 18;
    uint internal constant YEAR = 365 * 24 * 60 * 60;

    /*///////////////////////////////////
       MODIFIERS
    ///////////////////////////////////*/
    modifier authTrancheVault(uint8 id) {
        require(id < trancheVaultAddresses().length, "invalid trancheVault id");
        require(
            trancheVaultAddresses()[id] == _msgSender(),
            "trancheVault auth"
        );
        _;
    }

    modifier authFirstLossCapitalVault() {
        require(
            firstLossCapitalVaultAddress() == _msgSender(),
            "FLC vault auth"
        );
        _;
    }

    /*///////////////////////////////////
       INITIALIZATION
    ///////////////////////////////////*/

    function initialize(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _firstLossCapitalVaultAddress,
        address _feeSharingContractAddress
    ) external initializer {
        _validateInitParams(
            params,
            _trancheVaultAddresses,
            _firstLossCapitalVaultAddress,
            _feeSharingContractAddress
        );

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
        _setDefaultPenalty(params.defaultPenalty);
        _setPenaltyRateWad(params.penaltyRateWad);
        _setTranchesCount(params.tranchesCount);
        _setTrancheAPYsWads(params.trancheAPYsWads);
        _setTrancheBoostedAPYsWads(params.trancheBoostedAPYsWads);
        _setTrancheBoostRatios(params.trancheBoostRatios);
        _setTrancheCoveragesWads(params.trancheCoveragesWads);

        _setTrancheVaultAddresses(_trancheVaultAddresses);
        _setFirstLossCapitalVaultAddress(_firstLossCapitalVaultAddress);
        _setFeeSharingContractAddress(_feeSharingContractAddress);

        __Ownable_init();
        __Pausable_init();
    }

    /// @dev validates initializer params
    function _validateInitParams(
        LendingPoolParams calldata params,
        address[] calldata _trancheVaultAddresses,
        address _firstLossCapitalVaultAddress,
        address _feeSharingContractAddress
    ) internal pure {
        require(
            params.stableCoinContractAddress != address(0),
            "stableCoinContractAddress empty"
        );

        require(params.minFundingCapacity > 0, "minFundingCapacity == 0");
        require(params.maxFundingCapacity > 0, "maxFundingCapacity == 0");
        require(
            params.maxFundingCapacity >= params.minFundingCapacity,
            "maxFundingCapacity < minFundingCapacity"
        );

        require(params.fundingPeriodSeconds > 0, "fundingPeriodSeconds == 0");
        require(params.lendingTermSeconds > 0, "lendingTermSeconds == 0");
        require(params.borrowerAddress != address(0), "borrowerAddress empty");
        require(
            params.borrowerTotalInterestRateWad > 0,
            "borrower interest rate = 0%"
        );
        require(params.collateralRatioWad > 0, "collateralRatio == 0%");
        require(params.penaltyRateWad > 0, "penaltyRate == 0");

        require(params.tranchesCount > 0, "tranchesCount == 0");
        require(
            _trancheVaultAddresses.length == params.tranchesCount,
            "trancheAddresses length"
        );
        require(
            params.trancheAPYsWads.length == params.tranchesCount,
            "tranche APYs length"
        );
        require(
            params.trancheBoostedAPYsWads.length == params.tranchesCount,
            "tranche Boosted APYs length"
        );
        require(
            params.trancheBoostedAPYsWads.length == params.tranchesCount,
            "tranche Coverage APYs length"
        );

        for (uint i; i < params.tranchesCount; ++i) {
            require(params.trancheAPYsWads[i] > 0, "tranche APYs == 0");
            require(
                params.trancheBoostedAPYsWads[i] >= params.trancheAPYsWads[i],
                "tranche boosted APYs < tranche APYs"
            );
        }

        require(
            _firstLossCapitalVaultAddress != address(0),
            "firstLossCapitalVaultAddress == 0"
        );

        // require(params.feeSharingContractAddress != address(0), "feeSharingAddress empty"); // TODO: uncomment when fee sharing is developed
    }

    /*///////////////////////////////////
       ADMIN FUNCTIONS
    ///////////////////////////////////*/

    /** @dev Pauses the pool */
    function pause() external onlyOwner {
        _pause();
    }

    /** @dev Unpauses the pool */
    function unpause() external onlyOwner {
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
        if (interestRepaidAt() != 0) {
            return Stages.BORROWER_INTEREST_REPAID;
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
    function adminOpenPool() external onlyOwner {
        for (uint i; i < trancheVaultAddresses().length; i++) {
            _trancheVaultContracts()[i].enableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        _setOpenedAt(uint64(block.timestamp));
        emit PoolOpen();
    }

    /** @notice Checks whether the pool was funded successfully or not.
     *  this function is expected to be called by *owner* once the funding period ends
     */
    function adminTransitionToFundedState() external onlyOwner {
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

        // TODO: ditch the FLC vault all together?
        _firstLossCapitalVaultContract().enableDeposits();

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

    function _transitionToInterestRepaidStage() internal {
        _setInterestRepaidAt(uint64(block.timestamp));
    }

    function _transitionToPrincipalRepaidStage(uint repaidPrincipal) internal {
        _setRepaidAt(uint64(block.timestamp));
        emit BorrowerRepayPrincipal(borrowerAddress(), repaidPrincipal);
    }

    /*///////////////////////////////////
       Lender stakes
    ///////////////////////////////////*/
    /// @notice weighted APR
    function lenderTotalAprWad(
        address lenderAddress
    ) public view returns (uint) {
        uint weightedApysWad = 0;
        uint totalAssets = 0;
        for (uint8 i; i < tranchesCount(); ++i) {
            Rewardable storage rewardable = s_trancheRewardables[i][
                lenderAddress
            ];
            totalAssets += rewardable.stakedAssets;
            weightedApysWad += (lenderEffectiveAprByTrancheWad(
                lenderAddress,
                i
            ) * rewardable.stakedAssets);
        }

        if (totalAssets == 0) {
            return 0;
        }

        return weightedApysWad / totalAssets;
    }

    // @notice  Returns amount of stablecoins deposited to a pool tranche by a lender
    function lenderDepositedAssetsByTranche(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].stakedAssets;
    }

    // @notice  Returns amount of stablecoins deposited across all the pool tranches by a lender;
    function lenderAllDepositedAssets(
        address lenderAddress
    ) public view returns (uint totalAssets) {
        totalAssets = 0;
        for (uint8 i; i < tranchesCount(); ++i) {
            totalAssets += s_trancheRewardables[i][lenderAddress].stakedAssets;
        }
    }

    /*///////////////////////////////////
       Lender rewards
    ///////////////////////////////////*/
    function lenderRedeemRewardsByTranche(uint8 trancheId) external {
        uint toWithdraw = lenderRewardsByTrancheRedeemable(
            _msgSender(),
            trancheId
        );
        require(toWithdraw > 0, "nothing to withdraw");
        s_trancheRewardables[trancheId][_msgSender()]
            .redeemedRewards += toWithdraw;

        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(stableCoinContractAddress()),
            _msgSender(),
            toWithdraw
        );

        emit LenderWithdrawInterest(_msgSender(), trancheId, toWithdraw);
        _emitLenderTrancheRewardsChange(_msgSender(), trancheId);
    }

    function lenderLockPlatformTokensByTranche(
        uint8 trancheId,
        uint protocolTokens
    ) external {
        Rewardable storage r = s_trancheRewardables[trancheId][_msgSender()];
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(platformTokenContractAddress()),
            _msgSender(),
            address(this),
            protocolTokens
        );
        r.stakedPlatformTokens += protocolTokens;
    }

    function lenderUnlockPlatformTokensByTranche(
        uint8 trancheId,
        uint protocolTokens
    ) external {
        // TODO: check that the tranche is in repaid stage
        // TODO: check that all the rewards are paid out
    }

    /* VIEWS BY TRANCHE*/

    function lenderTotalExpectedRewardsByTranche(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return
            (lenderDepositedAssetsByTranche(lenderAddress, trancheId) *
                lenderEffectiveAprByTrancheWad(lenderAddress, trancheId) *
                lendingTermSeconds()) / (YEAR * WAD);
    }

    function lenderRewardsByTrancheProjectedByDate(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        if (fundedAt() > block.timestamp) {
            return 0;
        }
        uint64 secondsElapsed = uint64(block.timestamp) - fundedAt();
        return
            (lenderDepositedAssetsByTranche(lenderAddress, trancheId) *
                lenderEffectiveAprByTrancheWad(lenderAddress, trancheId) *
                secondsElapsed) / (YEAR * WAD);
    }

    function lenderRewardsByTrancheGeneratedByDate(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return
            (lenderTotalExpectedRewardsByTranche(lenderAddress, trancheId) *
                borrowerInterestRepaid()) / borrowerExpectedInterest();
    }

    function lenderRewardsByTrancheRedeemed(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].redeemedRewards;
    }

    function lenderRewardsByTrancheRedeemable(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return
            lenderRewardsByTrancheGeneratedByDate(lenderAddress, trancheId) -
            lenderRewardsByTrancheRedeemed(lenderAddress, trancheId);
    }

    /** @notice As tranches can be partly boosted by platform tokens,
     *  this will return the effective APR taking into account all the deposited USDC + platform tokens
     */
    function lenderEffectiveAprByTrancheWad(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        if (r.stakedAssets == 0) {
            return 0;
        }
        uint boostedAssets = r.stakedPlatformTokens /
            trancheBoostRatios()[trancheId];
        /// @dev prevent more APRs than stakedAssets allow
        if (boostedAssets > r.stakedAssets) {
            boostedAssets = r.stakedAssets;
        }
        uint unBoostedAssets = r.stakedAssets - boostedAssets;
        uint weightedAverage = (unBoostedAssets *
            trancheAPYsWads()[trancheId] +
            boostedAssets *
            trancheBoostedAPYsWads()[trancheId]) / r.stakedAssets;
        return weightedAverage;
    }

    function lenderPlatformTokensByTrancheLocked(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return
            s_trancheRewardables[trancheId][lenderAddress].stakedPlatformTokens;
    }

    function lenderPlatformTokensByTrancheLockable(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        uint maxLockablePlatformTokens = r.stakedAssets *
            trancheBoostRatios()[trancheId];
        return maxLockablePlatformTokens - r.stakedPlatformTokens;
    }

    /*///////////////////////////////////
       Borrower functions
    ///////////////////////////////////*/
    function borrow() external {
        uint firstLossCapitalDepositTarget = (collectedAssets() *
            collateralRatioWad()) / WAD;
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

    function borrowerPayInterest(uint assets) external {
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(stableCoinContractAddress()),
            _msgSender(),
            address(this),
            assets
        );

        uint assetsToSendToFeeSharing = assets;

        _setBorrowerInterestRepaid(borrowerInterestRepaid() + assets);
        emit BorrowerPayInterest(
            borrowerAddress(),
            assets,
            assets - assetsToSendToFeeSharing,
            assetsToSendToFeeSharing
        );

        if (borrowerOutstandingInterest() == 0) {
            _transitionToInterestRepaidStage();
        }
    }

    function borrowerRepayPrincipal() external {
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
        Rewardable storage rewardable = s_trancheRewardables[trancheId][
            depositorAddress
        ];

        // 2. add lender to the lenders set
        s_lenders.add(depositorAddress);

        // 3. add to the staked assets
        rewardable.stakedAssets += amount;
        _setCollectedAssets(collectedAssets() + amount);

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
            Rewardable storage rewardable = s_trancheRewardables[trancheId][
                depositorAddress
            ];

            assert(rewardable.stakedAssets >= amount);

            rewardable.stakedAssets -= amount;
            _setCollectedAssets(collectedAssets() - amount);

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

    function _trancheVaultContracts()
        internal
        view
        returns (TrancheVault[] memory contracts)
    {
        address[] memory addresses = trancheVaultAddresses();
        contracts = new TrancheVault[](addresses.length);

        for (uint i; i < addresses.length; ++i) {
            contracts[i] = TrancheVault(addresses[i]);
        }
    }

    function _firstLossCapitalVaultContract()
        internal
        view
        returns (FirstLossCapitalVault c)
    {
        c = FirstLossCapitalVault(firstLossCapitalVaultAddress());
    }

    function _emitLenderTrancheRewardsChange(
        address lenderAddress,
        uint8 trancheId
    ) internal {
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
