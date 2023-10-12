// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

abstract contract Component {

    uint256 public attachedPoolId;

    constructor(uint256 _attachedPoolId) {
        attachedPoolId = _attachedPoolId;
    }
}