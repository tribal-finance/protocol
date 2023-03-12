// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./LendingPool.sol";

contract PoolFactory is OwnableUpgradeable {
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

    function setImplementation(address implementation) external onlyOwner {
        implementationAddress = implementation;
    }

    function lastDeployedPoolRecord()
        external
        view
        returns (PoolRecord memory p)
    {
        p = poolRegistry[poolRegistry.length - 1];
    }

    /** @dev Deploys a clone of implementation as a new pool.
     * . See {LendingPool-initialize}
     */
    function deployUnitranchePool(
        string memory poolName,
        string memory symbol,
        IERC20Upgradeable underlying,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY_,
        uint borrowerAPY_
    ) external onlyOwner returns (address) {
        address poolAddress = Clones.clone(implementationAddress);

        LendingPool newPool = LendingPool(poolAddress);
        newPool.initialize(
            poolName,
            symbol,
            underlying,
            poolTarget,
            poolDuration,
            lenderAPY_,
            borrowerAPY_
        );
        newPool.transferOwnership(msg.sender);

        PoolRecord memory pool = PoolRecord(
            poolAddress,
            address(0),
            implementationAddress,
            poolName,
            symbol
        );

        poolRegistry.push(pool);

        return poolAddress;
    }
}
