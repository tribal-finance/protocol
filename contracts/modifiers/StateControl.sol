// SPDX-License-Identifier: MIT

import "../utils/Constants.sol";
import "../storage/PoolStorage.sol";

pragma solidity 0.8.18;

abstract contract StateControl {
    PoolStorage internal _poolStorage;

    function _initialize(PoolStorage __poolStorage) internal {
        _poolStorage = __poolStorage;
    }

    modifier onlyPoolBorrower() {
        _onlyPoolBorrower();
        _;
    }

    function _onlyPoolBorrower() internal view {
        address borrowerAddress = _poolStorage.getAddress("borrowerAddress");
        require(msg.sender == borrowerAddress, "LP003"); // "LendingPool: not a borrower"
    }

    modifier whenNotPaused() {
        require(_poolStorage.getBoolean("paused"), "contract paused");
        _;
    }

    modifier atStage(Constants.Stages _stage) {
        _atStage(_stage);
        _;
    }

    function _atStage(Constants.Stages _stage) internal view {
        Constants.Stages currentStage = Constants.Stages(_poolStorage.getUint256("currentStage"));
        require(currentStage == _stage, "LP004"); // "LendingPool: not at correct stage"
    }

    modifier atStages2(Constants.Stages _stage1, Constants.Stages _stage2) {
        _atStages2(_stage1, _stage2);
        _;
    }

    function _atStages2(Constants.Stages _stage1, Constants.Stages _stage2) internal view {
        Constants.Stages currentStage = Constants.Stages(_poolStorage.getUint256("currentStage"));
        require(currentStage == _stage1 || currentStage == _stage2, "LP004"); // "LendingPool: not at correct stage"
    }

    modifier atStages3(
        Constants.Stages _stage1,
        Constants.Stages _stage2,
        Constants.Stages _stage3
    ) {
        _atStages3(_stage1, _stage2, _stage3);
        _;
    }

    function _atStages3(Constants.Stages _stage1, Constants.Stages _stage2, Constants.Stages _stage3) internal view {
        Constants.Stages currentStage = Constants.Stages(_poolStorage.getUint256("currentStage"));
        require(
            currentStage == _stage1 || currentStage == _stage2 || currentStage == _stage3,
            "LP004" // "LendingPool: not at correct stage"
        );
    }
}
