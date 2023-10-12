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

    // String Storage
    function setString(uint256 instanceId, string memory value) external {
        stringStorage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getString(uint256 instanceId) external view returns (string memory) {
        return stringStorage[(keccak256(abi.encode(instanceId)))];
    }

    // Bytes Storage
    function setBytes(uint256 instanceId, bytes memory value) external {
        bytesStorage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getBytes(uint256 instanceId) external view returns (bytes memory) {
        return bytesStorage[keccak256(abi.encode(instanceId))];
    }

    // Uint Storage
    function setUint(uint256 instanceId, uint256 value) external {
        uintStorage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getUint(uint256 instanceId) external view returns (uint256) {
        return uintStorage[keccak256(abi.encode(instanceId))];
    }

    // Int Storage
    function setInt(uint256 instanceId, int256 value) external {
        intStorage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getInt(uint256 instanceId) external view returns (int256) {
        return intStorage[keccak256(abi.encode(instanceId))];
    }

    // Address Storage
    function setAddress(uint256 instanceId, address value) external {
        addressStorage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getAddress(uint256 instanceId) external view returns (address) {
        return addressStorage[keccak256(abi.encode(instanceId))];
    }

    // Boolean Storage
    function setBoolean(uint256 instanceId, bool value) external {
        booleanStorage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getBoolean(uint256 instanceId) external view returns (bool) {
        return booleanStorage[keccak256(abi.encode(instanceId))];
    }

    // Bytes32 Storage
    function setBytes32(uint256 instanceId, bytes32 value) external {
        bytes32Storage[keccak256(abi.encode(instanceId))] = value;
    }
    
    function getBytes32(uint256 instanceId) external view returns (bytes32) {
        return bytes32Storage[keccak256(abi.encode(instanceId))];
    }
}
