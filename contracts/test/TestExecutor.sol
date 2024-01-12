// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract TestExecutor {
    function execute(address _target, bytes calldata _data) external {
        (bool success, ) = _target.call(_data);
        require(success, "Execution failed");
    }
}