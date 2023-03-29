// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../pool/ILendingPool.sol";
import "../pool/LendingPool.sol";
import "../vaults/TrancheVault.sol";
import "../vaults/FirstLossCapitalVault.sol";

import "hardhat/console.sol";

contract PoolFactory is OwnableUpgradeable {
    using MathUpgradeable for uint;

    struct PoolRecord {
        string name;
        string tokenName;
        address poolAddress;
        address firstLossCapitalVaultAddress;
        address firstTrancheVaultAddress;
        address secondTrancheVaultAddress;
        address poolImplementationAddress;
        address trancheVaultImplementationAddress;
    }

    uint private constant WAD = 10 ** 18;

    event PoolCloned(address indexed addr, address implementationAddress);
    event TrancheVaultCloned(
        address indexed addr,
        address implementationAddress
    );
    event FirstLossCapitalPoolCloned(
        address indexed addr,
        address implementationAddress
    );
    event PoolDeployed(address indexed deployer, PoolRecord record);

    address public poolImplementationAddress;
    address public firstLossCapitalVaultImplementationAddress;
    address public trancheVaultImplementationAddress;

    PoolRecord[] public poolRegistry;

    function initialize() public initializer {
        __Ownable_init();
    }

    /// @dev sets implementation for future pool deployments
    function setPoolImplementation(address implementation) external onlyOwner {
        poolImplementationAddress = implementation;
    }

    /// @dev sets implementation for future tranche vault deployments
    function setTrancheVaultImplementation(
        address implementation
    ) external onlyOwner {
        trancheVaultImplementationAddress = implementation;
    }

    function setFirstLossCapitalVaultImplementation(
        address implementation
    ) external onlyOwner {
        firstLossCapitalVaultImplementationAddress = implementation;
    }

    /// @dev returns last deployed pool record
    function lastDeployedPoolRecord()
        external
        view
        returns (PoolRecord memory p)
    {
        p = poolRegistry[poolRegistry.length - 1];
    }

    /// @dev removes all the pool records from storage
    function clearPoolRecords() external onlyOwner {
        while (poolRegistry.length != 0) {
            poolRegistry.pop();
        }
    }

    /** @dev Deploys a clone of implementation as a new pool.
     * . See {LendingPool-initialize}
     */
    function deployPool(
        ILendingPool.LendingPoolParams calldata params,
        uint[] calldata fundingSplitWads
    ) external onlyOwner returns (address) {
        address poolAddress = Clones.clone(poolImplementationAddress);

        emit PoolCloned(poolAddress, poolImplementationAddress);

        address[] memory trancheVaultAddresses = _deployTrancheVaults(
            params,
            fundingSplitWads,
            poolAddress,
            _msgSender()
        );

        address firstLossCapitalVaultAddress = _deployFLCVault(
            params,
            poolAddress,
            _msgSender()
        );

        ILendingPool(poolAddress).initialize(
            params,
            trancheVaultAddresses,
            firstLossCapitalVaultAddress,
            address(0)
        );
        OwnableUpgradeable(poolAddress).transferOwnership(_msgSender());

        PoolRecord memory record = PoolRecord(
            params.name,
            params.token,
            poolAddress,
            firstLossCapitalVaultAddress,
            trancheVaultAddresses[0],
            trancheVaultAddresses.length > 1
                ? trancheVaultAddresses[1]
                : address(0),
            poolImplementationAddress,
            trancheVaultImplementationAddress
        );
        poolRegistry.push(record);

        emit PoolDeployed(_msgSender(), record);

        return poolAddress;
    }

    function _deployTrancheVaults(
        ILendingPool.LendingPoolParams calldata params,
        uint[] calldata fundingSplitWads,
        address poolAddress,
        address ownerAddress
    ) internal returns (address[] memory trancheVaultAddresses) {
        trancheVaultAddresses = new address[](params.tranchesCount);

        for (uint8 i; i < params.tranchesCount; ++i) {
            trancheVaultAddresses[i] = Clones.clone(
                trancheVaultImplementationAddress
            );
            emit TrancheVaultCloned(
                trancheVaultAddresses[i],
                trancheVaultImplementationAddress
            );

            TrancheVault(trancheVaultAddresses[i]).initialize(
                poolAddress,
                i,
                params.minFundingCapacity.mulDiv(fundingSplitWads[i], WAD),
                params.maxFundingCapacity.mulDiv(fundingSplitWads[i], WAD),
                string(
                    abi.encodePacked(
                        params.name,
                        " Tranche ",
                        Strings.toString(uint(i)),
                        " Token"
                    )
                ),
                string(
                    abi.encodePacked(
                        "tv",
                        Strings.toString(uint(i)),
                        params.token
                    )
                ),
                params.stableCoinContractAddress
            );
            TrancheVault(trancheVaultAddresses[i]).transferOwnership(
                ownerAddress
            );
        }
    }

    function _deployFLCVault(
        ILendingPool.LendingPoolParams calldata params,
        address poolAddress,
        address ownerAddress
    ) internal returns (address firstLossCapitalVaultAddress) {
        firstLossCapitalVaultAddress = Clones.clone(
            firstLossCapitalVaultImplementationAddress
        );

        emit FirstLossCapitalPoolCloned(
            firstLossCapitalVaultAddress,
            firstLossCapitalVaultImplementationAddress
        );

        string memory tokenName = string(
            abi.encodePacked(params.name, " First Loss Capital Token")
        );
        string memory symbol = string(abi.encodePacked("flc", params.token));
        FirstLossCapitalVault(firstLossCapitalVaultAddress).initialize(
            poolAddress,
            params.minFundingCapacity.mulDiv(params.collateralRatioWad, WAD),
            params.maxFundingCapacity.mulDiv(params.collateralRatioWad, WAD),
            tokenName,
            symbol,
            params.stableCoinContractAddress
        );
        OwnableUpgradeable(firstLossCapitalVaultAddress).transferOwnership(
            ownerAddress
        );
    }

    function _checkFundingSplitWads(
        ILendingPool.LendingPoolParams calldata params,
        uint[] calldata fundingSplitWads
    ) internal pure {
        require(
            fundingSplitWads.length == params.tranchesCount,
            "fundingSplitWads length"
        );

        uint sum;
        for (uint i; i < params.tranchesCount; ++i) {
            sum += fundingSplitWads[i];
        }

        require(sum / WAD == 1, "splits sum");
    }
}
