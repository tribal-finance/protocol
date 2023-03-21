// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract LendingPoolState {
    uint private s_minFundingCapacity;

    event ChangeMinFundingCapacity(uint oldValue, uint newValue);

    function minFundingCapacity() public view returns (uint) {
        return s_minFundingCapacity;
    }

    function _setMinFundingCapacity(uint newValue) internal {
        uint oldValue = s_minFundingCapacity;
        s_minFundingCapacity = newValue;
        emit ChangeMinFundingCapacity(oldValue, newValue);
    }

    uint private s_maxFundingCapacity;

    event ChangeMaxFundingCapacity(uint oldValue, uint newValue);

    function maxFundingCapacity() public view returns (uint) {
        return s_maxFundingCapacity;
    }

    function _setMaxFundingCapacity(uint newValue) internal {
        uint oldValue = s_maxFundingCapacity;
        s_maxFundingCapacity = newValue;
        emit ChangeMaxFundingCapacity(oldValue, newValue);
    }

    uint64 private s_duration;

    event ChangeDuration(uint64 oldValue, uint64 newValue);

    function duration() public view returns (uint64) {
        return s_duration;
    }

    function _setDuration(uint64 newValue) internal {
        uint64 oldValue = s_duration;
        s_duration = newValue;
        emit ChangeDuration(oldValue, newValue);
    }
}
