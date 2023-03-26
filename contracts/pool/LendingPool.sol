// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

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

    /** @dev Marks pool as opened
     * - sets openedAt
     * - enables deposits to the
     */
    function openPool() external onlyOwner {
        for (uint i; i < trancheVaultAddresses().length; i++) {
            _trancheVaultContracts()[i].enableDeposits();
            _trancheVaultContracts()[i].enableWithdrawals();
        }
        _setOpenedAt(uint64(block.timestamp));
    }

    /*///////////////////////////////////
       COMMUNICATION WITH VAULTS
    ///////////////////////////////////*/
    function onTrancheDeposit(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) {}

    function onTrancheWithdraw(
        uint8 trancheId,
        address depositorAddress,
        uint amount
    ) external authTrancheVault(trancheId) {}

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
