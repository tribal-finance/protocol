// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../governance/TribalGovernance.sol";
import "../pool/LendingPool.sol";
import "../components/Component.sol";
import "../components/PoolCoreComponent.sol";
import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Identifiers.sol";
import "../utils/Constants.sol";

import "hardhat/console.sol";

contract PoolFactory is Initializable {
    using Math for uint;

    struct PoolRecord {
        string name;
        string tokenName;
        address poolAddress;
        address firstTrancheVaultAddress;
        address secondTrancheVaultAddress;
        address[] poolComponents;
    }

    event PoolCloned(address indexed addr, address implementationAddress);
    event TrancheVaultCloned(address indexed addr, address implementationAddress);
    event PoolDeployed(address indexed deployer, PoolRecord record);

    address[] public poolComponents;

    PoolRecord[] public poolRegistry;

    address public feeSharingContractAddress;

    TribalGovernance public governance;
    PoolStorage public poolStorage;

    /// @dev we need to track a nonce as salt for each implementation
    mapping(address => uint256) public nonces;
    mapping(address => bool) public prevDeployedTranche;

    /// @notice used to gain function level access to systems by their instance id
    mapping(uint256 => mapping(bytes32 => address)) public componentRegistry;
    uint256 public deploymentCounter;

    function initialize(address _governance, address _poolStorage) public initializer {
        governance = TribalGovernance(_governance);
        poolStorage = PoolStorage(_poolStorage);
    }

    constructor() {
        _disableInitializers();
    }

    /// @notice it should be expressed that updating implemetation will make nonces at prior implementation stale
    /// @dev sets implementation for future pool deployments
    function setPoolComponents(address[] memory _components) external {
        require(governance.isAdmin(msg.sender), "not admin");
        poolComponents = _components;
    }

    function getPoolComponents() external view returns(address[] memory components) {
        return poolComponents;
    }

    function setFeeSharingContractAddress(address implementation) external {
        require(governance.isAdmin(msg.sender), "not admin");
        feeSharingContractAddress = implementation;
    }

    /// @dev returns last deployed pool record
    function lastDeployedPoolRecord() external view returns (PoolRecord memory p) {
        p = poolRegistry[poolRegistry.length - 1];
    }

    /// @dev removes all the pool records from storage
    function clearPoolRecords() external {
        require(governance.isAdmin(msg.sender), "not admin");
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
        Constants.LendingPoolParams calldata params,
        uint[][] calldata fundingSplitWads
    ) external returns (Component[] memory) {
        require(governance.isOwner(msg.sender), "not owner");
        // validate wad
        uint256 wadMax;
        uint256 wadMin;
        for(uint256 i = 0; i < fundingSplitWads.length; i++) {
            require(fundingSplitWads[i].length == 2, "LP026 - bad fundingSplitWads");
            wadMax += fundingSplitWads[i][0];
            wadMin += fundingSplitWads[i][1];
        }
        require(wadMax == 1e18, "LP024 - bad max wad");
        require(wadMin == 1e18, "LP027 - bad min wad");

        Component[] memory clonedPoolComponents = _clonePool();

        address[] memory trancheVaultAddresses = new address[](params.tranchesCount);
        

        for(uint256 i = 0; i < clonedPoolComponents.length; i++) {
            Component c = clonedPoolComponents[i];
            c.initialize(deploymentCounter, poolStorage);
            governance.grantRole(Constants.POOL_STORAGE_WRITER, address(c));

            bytes32 cID = c.identifer();
            console.log(uint256(cID));

            componentRegistry[deploymentCounter][cID] = address(c);
        }

        PoolCoreComponent(address(componentRegistry[deploymentCounter][Identifiers.POOL_CORE_COMPONENT])).initializeFromParams(params, trancheVaultAddresses, feeSharingContractAddress, address(governance), address(this));

       // address[] memory trancheVaultAddresses = _deployTrancheVaults(
       //     params,
       //     fundingSplitWads,
       //     poolAddress,
       //     msg.sender
       // );

        // initializePoolAndCreatePoolRecord(poolAddress, params, trancheVaultAddresses, feeSharingContractAddress);
        
        deploymentCounter++;
        return clonedPoolComponents;
    }

    function _clonePool() internal returns (Component[] memory) {
        require(governance.isOwner(msg.sender), "not owner");
        require(poolComponents.length > 0, "no pool components");

        Component[] memory clonedPoolComponents = new Component[](poolComponents.length);

        for(uint256 i = 0; i < poolComponents.length; i++) {
            address impl = poolComponents[i];
            clonedPoolComponents[i] = Component(Clones.cloneDeterministic(impl, bytes32(nonces[impl]++)));
            emit PoolCloned(address(clonedPoolComponents[i]), impl);
        }

        return clonedPoolComponents;
    }

    function _deployTrancheVaults(
        LendingPool.LendingPoolParams calldata params,
        uint[][] calldata fundingSplitWads,
        address poolAddress,
        address ownerAddress
    ) internal returns (address[] memory trancheVaultAddresses) {
        require(governance.isOwner(msg.sender), "not owner");
        require(params.tranchesCount > 0, "Error TrancheCount must be gt 0");
        trancheVaultAddresses = new address[](params.tranchesCount);

        for (uint8 i; i < params.tranchesCount; ++i) {
            //address impl = trancheVaultImplementationAddress;
            //trancheVaultAddresses[i] = Clones.cloneDeterministic(impl,  bytes32(nonces[impl]++));

            //emit TrancheVaultCloned(trancheVaultAddresses[i], impl);
            //prevDeployedTranche[trancheVaultAddresses[i]] = true;

            TrancheVault(trancheVaultAddresses[i]).initialize(
                poolAddress,
                i,
                params.minFundingCapacity.mulDiv(fundingSplitWads[i][1], Constants.WAD),
                params.maxFundingCapacity.mulDiv(fundingSplitWads[i][0], Constants.WAD),
                string(abi.encodePacked(params.name, " Tranche ", Strings.toString(uint(i)), " Token")),
                string(abi.encodePacked("tv", Strings.toString(uint(i)), params.token)),
                params.stableCoinContractAddress,
                address(governance)
            );
            require(!governance.hasRole(Constants.OWNER, ownerAddress), "must be unique owner");
            // TODO: remove this requirement in monolithic storage
            governance.grantRole(Constants.OWNER, ownerAddress);
        }
    }

    function initializePoolAndCreatePoolRecord(
        address poolAddress,
        LendingPool.LendingPoolParams calldata params,
        address[] memory trancheVaultAddresses,
        address _feeSharingContractAddress
    ) public {
        require(governance.isOwner(msg.sender), "not owner");
        LendingPool(poolAddress).initialize(
            params,
            trancheVaultAddresses,
            _feeSharingContractAddress,
            address(governance),
            address(this)
        );
        //Ownable(poolAddress).transferOwnership(msg.sender);
        governance.grantRole(Constants.OWNER, msg.sender);

        PoolRecord memory record = PoolRecord(
            params.name,
            params.token,
            poolAddress,
            trancheVaultAddresses[0],
            trancheVaultAddresses.length > 1 ? trancheVaultAddresses[1] : address(0),
            poolComponents
        );
        poolRegistry.push(record);

        emit PoolDeployed(msg.sender, record);
    }
}
