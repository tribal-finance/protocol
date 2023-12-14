// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;


import "../components/Component.sol";
import "../governance/TribalGovernance.sol";
import "../utils/Constants.sol";

contract PoolStorage {
    // globalized
    mapping(bytes32 => string) private globalStringStorage;
    mapping(bytes32 => bytes) private globalBytesStorage;
    mapping(bytes32 => uint256) private globalUintStorage;
    mapping(bytes32 => int256) private globalIntStorage;
    mapping(bytes32 => address) private globalAddressStorage;
    mapping(bytes32 => bool) private globalAooleanStorage;
    mapping(bytes32 => bytes32) private globalBytes32Storage;

    // localized
    mapping(bytes32 => string) private stringStorage;
    mapping(bytes32 => bytes) private bytesStorage;
    mapping(bytes32 => uint256) private uintStorage;
    mapping(bytes32 => int256) private intStorage;
    mapping(bytes32 => address) private addressStorage;
    mapping(bytes32 => bool) private booleanStorage;
    mapping(bytes32 => bytes32) private bytes32Storage;

    mapping(bytes32 => mapping(uint256 => address)) arrayAddressStorage;
    mapping(bytes32 => mapping(uint256 => uint256)) arrayUint256Storage;

    mapping(bytes32 => mapping(address => bytes)) mappingAddressToBytes;

    mapping(bytes32 => mapping(uint256 => mapping(address => bytes))) mappingUintAddressToBytes;

    TribalGovernance public governance;

    constructor(TribalGovernance _governance) {
        governance = _governance;
    }

    modifier canWrite() {
        require(governance.hasRole(Constants.POOL_STORAGE_WRITER, msg.sender), "write forbidden");
        _;
    }

    // Global String Storage
    function setStringGlobally(string memory label, string memory value) external canWrite {
        globalStringStorage[keccak256(abi.encode(label))] = value;
    }

    function getStringGlobally(string memory label) external view returns (string memory) {
        return globalStringStorage[(keccak256(abi.encode(label)))];
    }

    // Global Bytes Storage
    function setBytesGlobally(string memory label, bytes memory value) external canWrite {
        globalBytesStorage[keccak256(abi.encode(label))] = value;
    }

    function getBytesGlobally(string memory label) external view returns (bytes memory) {
        return globalBytesStorage[keccak256(abi.encode(label))];
    }

    // Global Uint Storage
    function setUint256Globally(string memory label, uint256 value) external canWrite {
        globalUintStorage[keccak256(abi.encode(label))] = value;
    }

    function getUint256Globally(string memory label) external view returns (uint256) {
        return globalUintStorage[keccak256(abi.encode(label))];
    }

    // Global Int Storage
    function setInt256Globally(string memory label, int256 value) external canWrite {
        globalIntStorage[keccak256(abi.encode(label))] = value;
    }

    function getInt256Globally(string memory label) external view returns (int256) {
        return globalIntStorage[keccak256(abi.encode(label))];
    }

    // Global Address Storage
    function setAddressGlobally(string memory label, address value) external canWrite {
        globalAddressStorage[keccak256(abi.encode(label))] = value;
    }

    function getAddressGlobally(string memory label) external view returns (address) {
        return globalAddressStorage[keccak256(abi.encode(label))];
    }

    // Global Boolean Storage
    function setBooleanGlobally(string memory label, bool value) external canWrite {
        globalAooleanStorage[keccak256(abi.encode(label))] = value; 
    }

    function getBooleanGlobally(string memory label) external view returns (bool) {
        return globalAooleanStorage[keccak256(abi.encode(label))];
    }

    // Global Bytes32 Storage
    function setBytes32Globally(string memory label, bytes32 value) external canWrite {
        globalBytes32Storage[keccak256(abi.encode(label))] = value;
    }

    function getBytes32Globally(string memory label) external view returns (bytes32) {
        return globalBytes32Storage[keccak256(abi.encode(label))];
    }

    // String Storage
    function setString(string memory label, string memory value) external canWrite {
        stringStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getString(string memory label) external view returns (string memory) {
        return stringStorage[(keccak256(abi.encode(Component(msg.sender), label)))];
    }

    // Bytes Storage
    function setBytes(string memory label, bytes memory value) external canWrite {
        bytesStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getBytes(string memory label) external view returns (bytes memory) {
        return bytesStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))];
    }

    // Uint Storage
    function setUint256(string memory label, uint256 value) external canWrite {
        uintStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getUint256(string memory label) external view returns (uint256) {
        return uintStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))];
    }

    // Int Storage
    function setInt256(string memory label, int256 value) external canWrite {
        intStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getInt256(string memory label) external view returns (int256) {
        return intStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))];
    }

    // Address Storage
    function setAddress(string memory label, address value) external canWrite {
        addressStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getAddress(string memory label) external view returns (address) {
        return addressStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))];
    }

    // Boolean Storage
    function setBoolean(string memory label, bool value) external canWrite {
        booleanStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getBoolean(string memory label) external view returns (bool) {
        return booleanStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))];
    }

    // Bytes32 Storage
    function setBytes32(string memory label, bytes32 value) external canWrite {
        bytes32Storage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))] = value;
    }

    function getBytes32(string memory label) external view returns (bytes32) {
        return bytes32Storage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))];
    }

    // complex localized types
    function setArrayAddress(string memory label, uint256 key, address value) external canWrite {
        arrayAddressStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key] = value;
    }

    function getArrayAddress(string memory label, uint256 key) external view returns (address) {
        return arrayAddressStorage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key];
    }

    function setArrayUint256(string memory label, uint256 key, uint256 value) external canWrite {
        arrayUint256Storage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key] = value;
    }

    function getArrayUint256(string memory label, uint256 key) external view returns (uint256) {
        return arrayUint256Storage[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key];
    }

    function setMappingAddressToBytes(
        string memory label,
        address key,
        bytes memory value
    ) external canWrite {
        mappingAddressToBytes[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key] = value;
    }

    function getMappingAddressToBytes(
        string memory label,
        address key
    ) external view returns (bytes memory) {
        return mappingAddressToBytes[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key];
    }

    function setMappingUint256AddressToBytes(
        string memory label,
        uint256 key0,
        address key1,
        bytes memory value
    ) external canWrite {
        mappingUintAddressToBytes[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key0][key1] = value;
    }

    function getMappingUint256AddressToBytes(
        string memory label,
        uint256 key0,
        address key1    
    ) external view returns (bytes memory) {
        return mappingUintAddressToBytes[keccak256(abi.encode(Component(msg.sender).instanceId(), label))][key0][key1];
    }
}
