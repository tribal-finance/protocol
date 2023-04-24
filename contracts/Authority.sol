// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "hardhat/console.sol";

/**
 * @title Authority Whitelist smart contract
 * @notice this contract manages a whitelists for all the borrowers and lenders
 */
contract Authority is OwnableUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    EnumerableSetUpgradeable.AddressSet whitelistedBorrowers;
    EnumerableSetUpgradeable.AddressSet whitelistedLenders;
    EnumerableSetUpgradeable.AddressSet admins;

    modifier onlyOwnerOrAdmin() {
        require(
            owner() == msg.sender || admins.contains(msg.sender),
            "Authority: caller is not the owner or admin"
        );
        _;
    }

    /// @dev initializer
    function initialize() external initializer {
        __Ownable_init();
    }

    /**
     * @notice adds borrower address to the whitelist.
     * @param a address to add to the whitelist
     */
    function addBorrower(address a) external onlyOwnerOrAdmin {
        whitelistedBorrowers.add(a);
    }

    /**
     * @notice removes borrower address from the whitelist.
     * @param a address to remove from the whitelist
     */
    function removeBorrower(address a) external onlyOwnerOrAdmin {
        whitelistedBorrowers.remove(a);
    }

    /**
     * @notice checks if the borrower address is in the whitelist.
     * @param a address to check
     * @return true if the address is in the whitelist
     */
    function isWhitelistedBorrower(address a) external view returns (bool) {
        return whitelistedBorrowers.contains(a);
    }

    /// @notice returns array of all whitelisted borrower addresses.
    function allBorrowers() external view returns (address[] memory) {
        uint length = whitelistedBorrowers.length();
        address[] memory addresses = new address[](length);
        for (uint i; i < length; i++) {
            addresses[i] = whitelistedBorrowers.at(i);
        }

        return addresses;
    }

    /**
     * @notice adds lenders address to the whitelist.
     * @param a address to add to the whitelist
     */
    function addLender(address a) external onlyOwnerOrAdmin {
        whitelistedLenders.add(a);
    }

    /**
     * @notice removes lenders address from the whitelist.
     * @param a address to remove from the whitelist
     */
    function removeLender(address a) external onlyOwnerOrAdmin {
        whitelistedLenders.remove(a);
    }

    /**
     * @notice checks if the lender address is in the whitelist.
     * @param a address to check
     * @return true if the address is in the whitelist
     */
    function isWhitelistedLender(address a) external view returns (bool) {
        return whitelistedLenders.contains(a);
    }

    /// @notice returns array of all whitelisted lender addresses
    function allLenders() external view returns (address[] memory) {
        uint length = whitelistedLenders.length();
        address[] memory addresses = new address[](length);
        for (uint i; i < length; i++) {
            addresses[i] = whitelistedLenders.at(i);
        }

        return addresses;
    }

    /**
     * @notice adds admin address to the list.
     * @param a address to add to the list
     */
    function addAdmin(address a) external onlyOwnerOrAdmin {
        admins.add(a);
    }

    /**
     * @notice removes admin address from the list.
     * @param a address to remove from the list
     */
    function removeAdmin(address a) external onlyOwnerOrAdmin {
        admins.remove(a);
    }

    /**
     * @notice checks if the admin in the list.
     * @param a address to check
     * @return true if the address is in the list
     */
    function isAdmin(address a) external view returns (bool) {
        return admins.contains(a);
    }

    /// @notice returns array of all admin addresses
    function allAdmins() external view returns (address[] memory) {
        uint length = admins.length();
        address[] memory addresses = new address[](length);
        for (uint i; i < length; i++) {
            addresses[i] = admins.at(i);
        }

        return addresses;
    }
}
