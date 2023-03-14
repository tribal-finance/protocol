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
        address poolAddress;
        address secondPoolAddress;
        address implementationAddress;
        string name;
        string tokenName;
    }

    address public implementationAddress;
    PoolRecord[] public poolRegistry;

    function initialize() public initializer {
        __Ownable_init();
    }

    /// @dev sets implementation for future pool deployments
    function setImplementation(address implementation) external onlyOwner {
        implementationAddress = implementation;
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
    ) external onlyOwner returns (address) {
        address poolAddress = Clones.clone(implementationAddress);
        _initPoolAndTransferOwnership(
            poolAddress,
            poolName_,
            symbol,
            underlying,
            poolTarget,
            poolDuration,
            lenderAPY_,
            borrowerAPY_,
            borrowerAddress_
        );

        PoolRecord memory pool = PoolRecord(
            poolAddress,
            address(0),
            implementationAddress,
            poolName_,
            symbol
        );

        poolRegistry.push(pool);

        emit PoolDeployed(
            owner(),
            poolAddress,
            address(0),
            implementationAddress,
            poolName_,
            symbol,
            poolTarget,
            poolDuration,
            lenderAPY_,
            borrowerAPY_,
            borrowerAddress_
        );

        return poolAddress;
    }

    function _initPoolAndTransferOwnership(
        address poolAddress,
        string memory poolName_,
        string memory symbol,
        IERC20Upgradeable underlying,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY_,
        uint borrowerAPY_,
        address borrowerAddress_
    ) internal {
        LendingPool newPool = LendingPool(poolAddress);
        newPool.initialize(
            poolName_,
            symbol,
            underlying,
            poolTarget,
            poolDuration,
            lenderAPY_,
            borrowerAPY_,
            borrowerAddress_
        );
        newPool.transferOwnership(msg.sender);
    }
}