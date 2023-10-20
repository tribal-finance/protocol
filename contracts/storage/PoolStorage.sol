// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

contract PoolStorage {
    mapping(bytes32 => string) private stringStorage;
    mapping(bytes32 => bytes) private bytesStorage;
    mapping(bytes32 => uint256) private uintStorage;
    mapping(bytes32 => int256) private intStorage;
    mapping(bytes32 => address) private addressStorage;
    mapping(bytes32 => bool) private booleanStorage;
    mapping(bytes32 => bytes32) private bytes32Storage;

    mapping(bytes32 => mapping (uint256 => address)) arrayAddressStorage;

    mapping(bytes32 => mapping (address => bytes)) mappingAddressToBytes;

    // String Storage
    function setString(uint256 instanceId, string memory label, string memory value) external {
        stringStorage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getString(uint256 instanceId, string memory label) external view returns (string memory) {
        return stringStorage[(keccak256(abi.encode(instanceId, label)))];
    }

    // Bytes Storage
    function setBytes(uint256 instanceId, string memory label, bytes memory value) external {
        bytesStorage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getBytes(uint256 instanceId, string memory label) external view returns (bytes memory) {
        return bytesStorage[keccak256(abi.encode(instanceId, label))];
    }

    // Uint Storage
    function setUint256(uint256 instanceId, string memory label, uint256 value) external {
        uintStorage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getUint256(uint256 instanceId, string memory label) external view returns (uint256) {
        return uintStorage[keccak256(abi.encode(instanceId, label))];
    }

    // Int Storage
    function setInt256(uint256 instanceId, string memory label, int256 value) external {
        intStorage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getInt256(uint256 instanceId, string memory label) external view returns (int256) {
        return intStorage[keccak256(abi.encode(instanceId, label))];
    }

    // Address Storage
    function setAddress(uint256 instanceId, string memory label, address value) external {
        addressStorage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getAddress(uint256 instanceId, string memory label) external view returns (address) {
        return addressStorage[keccak256(abi.encode(instanceId, label))];
    }

    // Boolean Storage
    function setBoolean(uint256 instanceId, string memory label, bool value) external {
        booleanStorage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getBoolean(uint256 instanceId, string memory label) external view returns (bool) {
        return booleanStorage[keccak256(abi.encode(instanceId, label))];
    }

    // Bytes32 Storage
    function setBytes32(uint256 instanceId, string memory label, bytes32 value) external {
        bytes32Storage[keccak256(abi.encode(instanceId, label))] = value;
    }
    
    function getBytes32(uint256 instanceId, string memory label) external view returns (bytes32) {
        return bytes32Storage[keccak256(abi.encode(instanceId, label))];
    }

    function setArrayAddress(uint256 instanceId, string memory label, uint256 key, address value) external {
        arrayAddressStorage[keccak256(abi.encode(instanceId, label))][key] = value;
    }

    function getArrayAddress(uint256 instanceId, string memory label, uint256 key) external view returns (address) {
        return arrayAddressStorage[keccak256(abi.encode(instanceId, label))][key];
    }

    function setMappingAddressToBytes(uint256 instanceId, string memory label, address key, bytes memory value) external {
        mappingAddressToBytes[keccak256(abi.encode(instanceId, label))][key] = value;
    }

    function getMappingAddressToBytes(uint256 instanceId, string memory label, address key) external view returns (bytes memory) {
        return mappingAddressToBytes[keccak256(abi.encode(instanceId, label))][key];

    }
}
