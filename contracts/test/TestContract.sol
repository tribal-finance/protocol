// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract TestContract {
    uint public s_version;

    function initialize(uint version) external {
        s_version = version;
    }
}
