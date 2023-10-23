// SPDX-License-Identifier: MIT

import "./Component.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";

pragma solidity 0.8.18;

contract PoolCalculationsComponent is Component {
    constructor(uint256 _instanceId, PoolStorage _poolStorage) Component(_instanceId, _poolStorage) {}

    
}