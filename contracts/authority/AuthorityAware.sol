// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "./IAuthority.sol";

abstract contract AuthorityAware is OwnableUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    IAuthority public authority;

    modifier onlyOwnerOrAdmin() {
        _onlyOwnerOrAdmin();
        _;
    }

    function _onlyOwnerOrAdmin() internal view {
        require(
            owner() == msg.sender || authority.isAdmin(msg.sender),
            "AA:OA" // "AuthorityAware: caller is not the owner or admin"
        );
    }

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() internal view {
        require(
            authority.isAdmin(msg.sender),
            "AA:A" // "AuthorityAware: caller is not an admin"
        );
    }

    modifier onlyBorrower() {
        _onlyBorrower();
        _;
    }

    function _onlyBorrower() internal view {
        require(
            authority.isWhitelistedBorrower(msg.sender),
            "AA:B" // "AuthorityAware: caller is not a whitelisted borrower"
        );
    }

    modifier onlyLender() {
        require(
            authority.isWhitelistedLender(msg.sender),
            "AA:L" // "AuthorityAware: caller is not a whitelisted lender"
        );
        _;
    }

    modifier onlyWhitelisted() {
        _onlyWhitelisted();
        _;
    }

    function _onlyWhitelisted() internal view {
        require(
            owner() == msg.sender ||
                authority.isWhitelistedBorrower(msg.sender) ||
                authority.isWhitelistedLender(msg.sender) ||
                authority.isAdmin(msg.sender),
            "AA:W" // "AuthorityAware: caller is not a whitelisted borrower or lender"
        );
    }

    function __AuthorityAware__init(address _authority) internal {
        authority = IAuthority(_authority);
    }
}
