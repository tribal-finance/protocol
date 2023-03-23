// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract TestContract {
    string public s_name;
    int public s_version;

    struct InitParams {
        string name;
        int version;
    }

    function initialize(InitParams calldata params) external {
        s_name = params.name;
        s_version = params.version;
    }
}
