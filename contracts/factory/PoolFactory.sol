// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "../governance/TribalGovernance.sol";
import "../pool/LendingPool.sol";
import "../component/Component.sol";

contract PoolFactory is Initializable {
    using Math for uint;

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

    TribalGovernance public governance;

    /// @dev we need to track a nonce as salt for each implementation
    mapping(address => uint256) public nonces;
    mapping(address => bool) public prevDeployedTranche;

    /// @notice used to gain function level access to systems by their instance id
    mapping(uint256 => Component[]) public componentBundles;

    function initialize(address _governance) public initializer {
        governance = TribalGovernance(_governance);
    }

    constructor() {
        _disableInitializers();
    }

    /// @notice it should be expressed that updating implemetation will make nonces at prior implementation stale
    /// @dev sets implementation for future pool deployments
    function setPoolImplementation(address implementation) external {
        require(governance.isAdmin(msg.sender), "not admin");
        poolImplementationAddress = implementation;
    }

    /// @dev sets implementation for future tranche vault deployments
    function setTrancheVaultImplementation(address implementation) external {
        require(governance.isAdmin(msg.sender), "not admin");
        trancheVaultImplementationAddress = implementation;
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
        LendingPool.LendingPoolParams calldata params,
        uint[][] calldata fundingSplitWads
    ) external returns (address) {
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

        address poolAddress = _clonePool();

        address[] memory trancheVaultAddresses = _deployTrancheVaults(
            params,
            fundingSplitWads,
            poolAddress,
            msg.sender
        );

        initializePoolAndCreatePoolRecord(poolAddress, params, trancheVaultAddresses, feeSharingContractAddress);

        return poolAddress;
    }

    function _clonePool() internal returns (address poolAddress) {
        require(governance.isOwner(msg.sender), "not owner");
        address impl = poolImplementationAddress;
        poolAddress = Clones.cloneDeterministic(impl, bytes32(nonces[impl]++));
        emit PoolCloned(poolAddress, poolImplementationAddress);
    }

    function nextLender() public view returns(address) {
        return nextAddress(poolImplementationAddress);
    }

    function nextLenders() public view returns(address[4] memory lenders) {
        address impl = poolImplementationAddress;
        for(uint256 i = 0; i < lenders.length; i++) {
            lenders[i] = Clones.predictDeterministicAddress(impl, bytes32(nonces[impl] + i));
        }
    }

    function nextTranches() public view returns(address[8] memory lenders) {
        address impl = trancheVaultImplementationAddress;
        for(uint256 i = 0; i < lenders.length; i++) {
            lenders[i] = Clones.predictDeterministicAddress(impl, bytes32(nonces[impl] + i));
        }
    }

    function nextAddress(address impl) public view returns(address) {
        return Clones.predictDeterministicAddress(impl, bytes32(nonces[impl] + 1));
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
            address impl = trancheVaultImplementationAddress;
            trancheVaultAddresses[i] = Clones.cloneDeterministic(impl,  bytes32(nonces[impl]++));

            emit TrancheVaultCloned(trancheVaultAddresses[i], impl);
            prevDeployedTranche[trancheVaultAddresses[i]] = true;

            TrancheVault(trancheVaultAddresses[i]).initialize(
                poolAddress,
                i,
                params.minFundingCapacity.mulDiv(fundingSplitWads[i][1], WAD),
                params.maxFundingCapacity.mulDiv(fundingSplitWads[i][0], WAD),
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
        Ownable(poolAddress).transferOwnership(msg.sender);

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

        emit PoolDeployed(msg.sender, record);
    }
}
