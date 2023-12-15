// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

contract PoolStorageTester {

    event ReturnData(bytes);

    uint256 public instanceId;
    address public to;

    function execute(bytes memory _functionData) public returns (bytes memory) {
        (bool success, bytes memory returnData) = to.call(_functionData);
        require(success, "Call failed");
        emit ReturnData(returnData);
        return returnData;
    }

    function setPoolStorage(address _poolStorage) public {
        to = _poolStorage;
    }

    function setInstanceId(uint256 _instanceId) public {
        instanceId = _instanceId;
    }
}
