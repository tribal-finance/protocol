// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./LendingPool.sol";

contract PoolFactory is OwnableUpgradeable {
    event PoolDeployed(
        address indexed deployer,
        address indexed poolAddress,
        address indexed secondPoolAddress,
        address implementationAddress,
        string name,
        string tokenName,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY,
        uint borrowerAPY,
        address borrowerAddress
    );

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

    address public poolImplementationAddress;
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
    function deployUnitranchePool(
        string memory poolName_,
        string memory symbol,
        IERC20Upgradeable underlying,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY_,
        uint borrowerAPY_,
        address borrowerAddress_
    ) external onlyOwner returns (address) {}

    function _initPoolAndTransferOwnership() internal {}
}
