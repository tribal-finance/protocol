// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract FeeSharing is Initializable, PausableUpgradeable, OwnableUpgradeable {
    address public s_foundationAddress;
    address public s_stakingAddress;
    function initialize(address foundationAddress, address stakingAddress) public initializer {
        s_foundationAddress = foundationAddress;
        s_stakingAddress = stakingAddress;
        __Pausable_init();
        __Ownable_init();
    }

    function deposit() external whenNotPaused {
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }
}