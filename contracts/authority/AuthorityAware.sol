// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "./IAuthority.sol";

abstract contract AuthorityAware is OwnableUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    IAuthority public authority;

    modifier onlyOwnerOrAdmin() {
        require(
            owner() == msg.sender || authority.isAdmin(msg.sender),
            "AuthorityAware: caller is not the owner or admin"
        );
        _;
    }

    modifier onlyAdmin() {
        require(authority.isAdmin(msg.sender), "AuthorityAware: caller is not an admin");
        _;
    }

    modifier onlyBorrower() {
        require(authority.isWhitelistedBorrower(msg.sender), "AuthorityAware: caller is not a whitelisted borrower");
        _;
    }

    modifier onlyLender() {
        require(authority.isWhitelistedLender(msg.sender), "AuthorityAware: caller is not a whitelisted lender");
        _;
    }

    modifier onlyWhitelisted() {
        require(
            owner() == msg.sender ||
                authority.isWhitelistedBorrower(msg.sender) ||
                authority.isWhitelistedLender(msg.sender) ||
                authority.isAdmin(msg.sender),
            "AuthorityAware: caller is not a whitelisted borrower or lender"
        );
        _;
    }

    function __AuthorityAware__init(address _authority) internal {
        authority = IAuthority(_authority);
    }
}
