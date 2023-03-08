// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableMapUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

abstract contract LendingPoolStorage {
    using EnumerableMapUpgradeable for EnumerableMapUpgradeable.AddressToUintMap;

    address public USDC_ADDRESS;

    uint64 internal _createdAt;
    uint64 internal _fundedAt;
    uint64 internal _duration;
    uint64 internal _repaidAt;

    uint internal _targetAmount;
    uint internal _fundedAmount;
    address internal _borrower;

    EnumerableMapUpgradeable.AddressToUintMap internal _lenderStakes;

    function USDCContract() public view returns (IERC20) {
        return IERC20(USDC_ADDRESS);
    }
}
