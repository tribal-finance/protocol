// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../pool/LendingPool.sol";
import "../vaults/TrancheVault.sol";

contract PoolFactory is OwnableUpgradeable {
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

    function initialize() public initializer {
        __Ownable_init();
    }

    /// @dev sets implementation for future pool deployments
    function setPoolImplementation(address implementation) external onlyOwner {
        poolImplementationAddress = implementation;
    }

    /// @dev sets implementation for future tranche vault deployments
    function setTrancheVaultImplementation(address implementation) external onlyOwner {
        trancheVaultImplementationAddress = implementation;
    }

    function setFeeSharingContractAddress(address implementation) external onlyOwner {
        feeSharingContractAddress = implementation;
    }

    /// @dev returns last deployed pool record
    function lastDeployedPoolRecord() external view returns (PoolRecord memory p) {
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

        initializePoolAndCreatePoolRecord(
            poolAddress,
            params,
            trancheVaultAddresses,
            feeSharingContractAddress
        );

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
                params.stableCoinContractAddress
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
            _feeSharingContractAddress
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

    function _checkFundingSplitWads(
        LendingPool.LendingPoolParams calldata params,
        uint[] calldata fundingSplitWads
    ) internal pure {
        require(fundingSplitWads.length == params.tranchesCount, "fundingSplitWads length");

        uint sum;
        for (uint i; i < params.tranchesCount; ++i) {
            sum += fundingSplitWads[i];
        }

        require(sum / WAD == 1, "splits sum");
    }
}
