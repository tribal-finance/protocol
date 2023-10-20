// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "../storage/PoolStorage.sol";

abstract contract Component {

    uint256 public instanceId;
    PoolStorage public poolStorage;

    constructor(uint256 _instanceId, PoolStorage _poolStorage) {
        instanceId = _instanceId;
        poolStorage = _poolStorage;
    }
}