// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../pool/LendingPool.sol";
import "../vaults/TrancheVault.sol";
import "../authority/AuthorityAware.sol";

contract PoolFactory is AuthorityAware {
    using MathUpgradeable for uint;

    struct PoolRecord {
        string name;
        string tokenName;
        address poolAddress;
        address firstTrancheVaultAddress;
        address secondTrancheVaultAddress;
        address poolImplementationAddress;
        address trancheVaultImplementationAddress;
    }

    uint private constant WAD = 10 ** 18;

    event PoolCloned(address indexed addr, address implementationAddress);
    event TrancheVaultCloned(address indexed addr, address implementationAddress);
    event PoolDeployed(address indexed deployer, PoolRecord record);

    address public poolImplementationAddress;
    address public trancheVaultImplementationAddress;

    PoolRecord[] public poolRegistry;

    address public feeSharingContractAddress;

    function initialize(address _authority) public initializer {
        __Ownable_init();
        __AuthorityAware__init(_authority);
    }

    /// @dev sets implementation for future pool deployments
    function setPoolImplementation(address implementation) external onlyOwnerOrAdmin {
        poolImplementationAddress = implementation;
    }

    /// @dev sets implementation for future tranche vault deployments
    function setTrancheVaultImplementation(address implementation) external onlyOwnerOrAdmin {
        trancheVaultImplementationAddress = implementation;
    }

    function setFeeSharingContractAddress(address implementation) external onlyOwnerOrAdmin {
        feeSharingContractAddress = implementation;
    }

    /// @dev returns last deployed pool record
    function lastDeployedPoolRecord() external view returns (PoolRecord memory p) {
        p = poolRegistry[poolRegistry.length - 1];
    }

    /// @dev removes all the pool records from storage
    function clearPoolRecords() external onlyOwnerOrAdmin {
        delete poolRegistry;
    }

    /// @dev gets the length of the pool of records 
    function poolRecordsLength() external view returns (uint) {
        return poolRegistry.length;
    }

    /** @dev Deploys a clone of implementation as a new pool.
     * . See {LendingPool-initialize}
     */
    function deployPool(
        LendingPool.LendingPoolParams calldata params,
        uint[] calldata fundingSplitWads
    ) external onlyOwner returns (address) {
        address poolAddress = clonePool();

        address[] memory trancheVaultAddresses = deployTrancheVaults(
            params,
            fundingSplitWads,
            poolAddress,
            _msgSender()
        );

        initializePoolAndCreatePoolRecord(poolAddress, params, trancheVaultAddresses, feeSharingContractAddress);

        return poolAddress;
    }

    function clonePool() public onlyOwner returns (address poolAddress) {
        poolAddress = Clones.clone(poolImplementationAddress);
        emit PoolCloned(poolAddress, poolImplementationAddress);
    }

    function deployTrancheVaults(
        LendingPool.LendingPoolParams calldata params,
        uint[] calldata fundingSplitWads,
        address poolAddress,
        address ownerAddress
    ) public onlyOwner returns (address[] memory trancheVaultAddresses) {
        trancheVaultAddresses = new address[](params.tranchesCount);

        for (uint8 i; i < params.tranchesCount; ++i) {
            trancheVaultAddresses[i] = Clones.clone(trancheVaultImplementationAddress);
            emit TrancheVaultCloned(trancheVaultAddresses[i], trancheVaultImplementationAddress);

            TrancheVault(trancheVaultAddresses[i]).initialize(
                poolAddress,
                i,
                params.minFundingCapacity.mulDiv(fundingSplitWads[i], WAD),
                params.maxFundingCapacity.mulDiv(fundingSplitWads[i], WAD),
                string(abi.encodePacked(params.name, " Tranche ", Strings.toString(uint(i)), " Token")),
                string(abi.encodePacked("tv", Strings.toString(uint(i)), params.token)),
                params.stableCoinContractAddress,
                address(authority)
            );
            TrancheVault(trancheVaultAddresses[i]).transferOwnership(ownerAddress);
        }
    }

    function initializePoolAndCreatePoolRecord(
        address poolAddress,
        LendingPool.LendingPoolParams calldata params,
        address[] memory trancheVaultAddresses,
        address _feeSharingContractAddress
    ) public onlyOwner {
        LendingPool(poolAddress).initialize(
            params,
            trancheVaultAddresses,
            _feeSharingContractAddress,
            address(authority),
            address(this)
        );
        OwnableUpgradeable(poolAddress).transferOwnership(_msgSender());

        PoolRecord memory record = PoolRecord(
            params.name,
            params.token,
            poolAddress,
            trancheVaultAddresses[0],
            trancheVaultAddresses.length > 1 ? trancheVaultAddresses[1] : address(0),
            poolImplementationAddress,
            trancheVaultImplementationAddress
        );
        poolRegistry.push(record);

        emit PoolDeployed(_msgSender(), record);
    }
}
