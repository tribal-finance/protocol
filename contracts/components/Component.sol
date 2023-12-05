// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "../storage/PoolStorage.sol";

abstract contract Component is Initializable {

    uint256 public instanceId;
    bytes32 public identifer;
    PoolStorage public poolStorage;

    function initialize(uint256 _instanceId, bytes32 _identifier, PoolStorage _poolStorage) public {
        instanceId = _instanceId;
        identifer = _identifier;
        poolStorage = _poolStorage;
    }
}