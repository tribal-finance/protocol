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
    function adminTransitionToFundedState() external onlyOwner {}

    /*///////////////////////////////////
       Lender stakes
    ///////////////////////////////////*/

    // @notice  Returns amount of stablecoins deposited to a pool tranche
    function lenderStakedAssetsByTranche(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        return s_trancheRewardables[trancheId][lenderAddress].stakedAssets;
    }

    // @notice  Returns amount of stablecoins deposited across all the pool tranches
    function lenderAllStakedAssets(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint totalAssets) {
        totalAssets = 0;
        for (uint i; i < tranchesCount(); ++i) {
            totalAssets += s_trancheRewardables[trancheId][lenderAddress]
                .stakedAssets;
        }
    }

    function lenderTotalApyWad(address) external view returns (uint) {
        return 0;
    }

    function lenderTotalAdjustedApyWad(address) external view returns (uint) {
        return 0;
    }

    function lenderWithdrawRewardsByTranche(uint trancheId) external {
        revert("not implemented");
    }

    /*///////////////////////////////////
       Lender rewards
    ///////////////////////////////////*/

    function lenderRewardsByTrancheGeneratedByDate(
        uint trancheId
    ) external view returns (uint) {
        return 0;
    }

    function lenderRewardsByTrancheWithdrawable(
        uint trancheId
    ) external view returns (uint) {
        return 0;
    }

    function lenderWithdrawAllRewards() external {
        revert("not implemented");
    }

    function lenderAllRewadsGeneratedByDate() external {
        revert("not implemented");
    }

    function lenderAllRewardsWithdrawable() external {
        revert("not implemented");
    }

    /*///////////////////////////////////
       Borrower functions
    ///////////////////////////////////*/
    function borrow() external {
        revert("not implemented");
    }

    function borrowerOutstandingInterest() external view returns (uint) {
        return 0;
    }

    function borrowerPayInterest(uint assets) external {
        revert("not implemented");
    }

    function borrowerRepayPrincipal() external {
        revert("not implemented");
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
    }

    /// @dev FirstLossCapitalVault will call that callback function when a borrower deposits assets
    function onFirstLossCapitalDeposit(
        address receiverAddress,
        uint amount
    ) external authFirstLossCapitalVault {}

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
