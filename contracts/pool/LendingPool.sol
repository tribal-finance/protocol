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
        if (borrowedAt() != 0) {
            return Stages.BORROWED;
        }
        if (flcDepositedAt() != 0) {
            return Stages.FLC_DEPOSITED;
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
        if (allDepositedAssets() >= minFundingCapacity()) {
            _transitionToFundedStage();
        } else {
            _transitionToFundingFailedStage();
        }
    }

    function _transitionToFundedStage() internal {
        _setFundedAt(uint64(block.timestamp));
        _setCollectedAssets(allDepositedAssets());

        for (uint i; i < trancheVaultAddresses().length; i++) {
            _trancheVaultContracts()[i].disableDeposits();
            _trancheVaultContracts()[i].disableWithdrawals();
        }

        _firstLossCapitalVaultContract().poolSetDepositTarget(
            firstLossCapitalDepositTarget()
        );
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

    function _transitionToFlcDepositedStage(uint amount) internal {
        _firstLossCapitalVaultContract().disableDeposits();
        _firstLossCapitalVaultContract().disableWithdrawals();
        _setFlcDepositedAt(uint64(block.timestamp));
        emit BorrowerDepositFirstLossCapital(borrowerAddress(), amount);
    }

    /*///////////////////////////////////
       Lender stakes
    ///////////////////////////////////*/

    // @notice  Returns amount of stablecoins deposited to a pool tranche by all the lenders
    function depositedAssetsByTranche(
        uint8 trancheId
    ) public view returns (uint) {
        uint stakedAssets = 0;
        for (uint i; i < s_lenders.length(); ++i) {
            address lenderAddress = s_lenders.at(i);
            stakedAssets += s_trancheRewardables[trancheId][lenderAddress]
                .stakedAssets;
        }
        return stakedAssets;
    }

    function allDepositedAssets() public view returns (uint) {
        // @notice  Returns amount of stablecoins deposited to all pool tranches by all the lenders
        uint stakedAssets = 0;
        for (uint i; i < s_lenders.length(); ++i) {
            address lenderAddress = s_lenders.at(i);
            for (uint8 trancheId; trancheId < tranchesCount(); ++trancheId) {
                stakedAssets += s_trancheRewardables[trancheId][lenderAddress]
                    .stakedAssets;
            }
        }
        return stakedAssets;
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

    function lenderTotalApyWad(
        address lenderAddress
    ) public view returns (uint) {
        uint weightedApysWad = 0;
        uint totalAssets = 0;
        for (uint8 i; i < tranchesCount(); ++i) {
            Rewardable storage rewardable = s_trancheRewardables[i][
                lenderAddress
            ];
            totalAssets += rewardable.stakedAssets;
            if (rewardable.isBoosted) {
                weightedApysWad +=
                    trancheBoostedAPYsWads()[i] *
                    rewardable.stakedAssets;
            } else {
                weightedApysWad +=
                    trancheAPYsWads()[i] *
                    rewardable.stakedAssets;
            }
        }

        if (totalAssets == 0) {
            return 0;
        }

        return weightedApysWad / totalAssets;
    }

    function lenderTotalAdjustedApyWad(
        address lenderAddress
    ) public view returns (uint) {
        return
            (lenderTotalApyWad(lenderAddress) * uint(lendingTermSeconds())) /
            YEAR;
    }

    /*///////////////////////////////////
       Lender rewards
    ///////////////////////////////////*/
    function lenderWithdrawRewardsByTranche(uint trancheId) external {
        revert("not implemented");
    }

    function lenderWithdrawAllRewards() external {
        revert("not implemented");
    }

    /* VIEWS */

    function lenderTotalExpectedRewardsByTranche(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        Rewardable storage r = s_trancheRewardables[trancheId][lenderAddress];
        return
            (r.stakedAssets * _adjustedTrancheAPYWad(trancheId, r.isBoosted)) /
            WAD;
    }

    function lenderRewardsByTrancheProjectedByDate(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        if (fundedAt() < block.timestamp) {
            return 0;
        }
        uint64 secondsElapsed = uint64(block.timestamp) - fundedAt();
        return
            (lenderTotalExpectedRewardsByTranche(lenderAddress, trancheId) *
                secondsElapsed) / lendingTermSeconds();
    }

    function lenderRewardsByTrancheGeneratedByDate(
        address lenderAddress,
        uint8 trancheId
    ) external view returns (uint) {
        return s_generatedRewards[trancheId][lenderAddress];
    }

    function lenderRewardsByTranchePaidByDate(
        address lenderAddress,
        uint8 trancheId
    ) external view returns (uint) {
        return s_repaidRewards[trancheId][lenderAddress];
    }

    function lenderRewardsByTrancheWithdrawable(
        address lenderAddress,
        uint8 trancheId
    ) external view returns (uint) {
        return
            s_generatedRewards[trancheId][lenderAddress] -
            s_repaidRewards[trancheId][lenderAddress];
    }

    function _adjustedTrancheAPYWad(
        uint8 trancheId,
        bool isBoosted
    ) internal view returns (uint) {
        if (isBoosted) {
            return (trancheAPYsWads()[trancheId] * lendingTermSeconds()) / YEAR;
        } else {
            return
                (trancheBoostedAPYsWads()[trancheId] * lendingTermSeconds()) /
                YEAR;
        }
    }

    /*///////////////////////////////////
       Borrower functions
    ///////////////////////////////////*/
    function borrow() external {
        uint total = 0;

        for (uint8 i; i < tranchesCount(); ++i) {
            TrancheVault trancheContract = _trancheVaultContracts()[i];
            trancheContract.sendAssets(
                borrowerAddress(),
                trancheContract.totalAssets()
            );

            total += trancheContract.totalAssets();
        }

        _setBorrowedAt(uint64(block.timestamp));

        emit BorrowerBorrow(borrowerAddress(), total);
    }

    function borrowerPayInterest(uint assets) external {
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(stableCoinContractAddress()),
            _msgSender(),
            address(this),
            assets
        );

        uint assetsToSendToFeeSharing = assets;

        for (uint8 trancheId; trancheId < tranchesCount(); ++trancheId) {
            uint shareAdjustedBooostedAPYWad = (_adjustedTrancheAPYWad(
                trancheId,
                true
            ) * assets) / borrowerExpectedInterest();
            uint shareAdjustedAPYWad = (_adjustedTrancheAPYWad(
                trancheId,
                false
            ) * assets) / borrowerExpectedInterest();

            for (uint i; i < s_lenders.length(); ++i) {
                address lenderAddress = s_lenders.at(i);
                Rewardable storage r = s_trancheRewardables[trancheId][
                    lenderAddress
                ];
                uint rewardedAssets = r.isBoosted
                    ? ((shareAdjustedBooostedAPYWad * r.stakedAssets) / WAD)
                    : ((shareAdjustedAPYWad * r.stakedAssets) / WAD);
                s_generatedRewards[trancheId][lenderAddress] += rewardedAssets;
                assetsToSendToFeeSharing -= rewardedAssets;
            }
        }

        _setBorrowerInterestRepaid(borrowerInterestRepaid() + assets);
        emit BorrowerPayInterest(
            borrowerAddress(),
            assets,
            assets - assetsToSendToFeeSharing,
            assetsToSendToFeeSharing
        );
    }

    function weightedAllLendersRewardRateWad() public view returns (uint) {
        uint expectedRewards = 0;
        uint stakes = 0;
        for (uint8 trancheId; trancheId < tranchesCount(); ++trancheId) {
            for (uint i; i < s_lenders.length(); ++i) {
                address lenderAddress = s_lenders.at(i);
                Rewardable storage r = s_trancheRewardables[trancheId][
                    lenderAddress
                ];
                stakes += r.stakedAssets;
                uint rewards = ((_adjustedTrancheAPYWad(
                    trancheId,
                    r.isBoosted
                ) * r.stakedAssets) / WAD);
                expectedRewards += rewards;
            }
        }

        return expectedRewards / stakes;
    }

    function borrowerRepayPrincipal() external {}

    function firstLossCapitalDepositTarget() public view returns (uint) {
        return (collectedAssets() * collateralRatioWad()) / WAD;
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
    function borrowerOutstandingInterest() external view returns (uint) {
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
        Rewardable storage rewardable = s_trancheRewardables[trancheId][
            depositorAddress
        ];

        s_lenders.add(depositorAddress);
        rewardable.stakedAssets += amount;
        rewardable.start = uint64(block.timestamp);

        emit LenderDeposit(depositorAddress, trancheId, amount);
    }

    /// @dev TrancheVault will call that callback function when a lender withdraws assets
    function onTrancheWithdraw(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) {
        Rewardable storage rewardable = s_trancheRewardables[trancheId][
            depositorAddress
        ];

        assert(rewardable.stakedAssets >= amount);

        rewardable.stakedAssets -= amount;
        if (rewardable.stakedAssets == 0) {
            s_lenders.remove(depositorAddress);
        }
        emit LenderWithdraw(depositorAddress, trancheId, amount);
    }

    /// @dev FirstLossCapitalVault will call that callback function when a borrower deposits assets
    function onFirstLossCapitalDeposit(
        address receiverAddress,
        uint amount
    ) external authFirstLossCapitalVault {
        if (amount == firstLossCapitalDepositTarget()) {
            _transitionToFlcDepositedStage(amount);
        }
    }

    /// @dev FirstLossCapitalVault will call that callback function when a borrower witdraws assets
    function onFirstLossCapitalWithdraw(
        address ownerAddress,
        uint amount
    ) external authFirstLossCapitalVault {}

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
}
