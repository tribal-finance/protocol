// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "hardhat/console.sol";

/** @dev manages whitelisted borrowers and lenders
 */
contract Authority is OwnableUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    EnumerableSetUpgradeable.AddressSet whitelistedBorrowers;
    EnumerableSetUpgradeable.AddressSet whitelistedLenders;

    /** @dev initializer */
    function initialize() external initializer {
        __Ownable_init();
    }

    /** @dev adds borrower address to the whitelist.
     * @param a address to add to the whitelist
     */
    function addBorrower(address a) external onlyOwner {
        whitelistedBorrowers.add(a);
    }

    /** @dev removes borrower address from the whitelist.
     * @param a address to remove from the whitelist
     */
    function removeBorrower(address a) external onlyOwner {
        whitelistedBorrowers.remove(a);
    }

    /** @dev checks if the borrower address is in the whitelist.
     * @param a address to check
     * @return true if the address is in the whitelist
     */
    function isWhitelistedBorrower(address a) external view returns (bool) {
        return whitelistedBorrowers.contains(a);
    }

    /** @dev returns array of all whitelisted borrowers  */
    function allBorrowers() external view returns (address[] memory) {
        uint length = whitelistedBorrowers.length();
        address[] memory addresses = new address[](length);
        for (uint i; i < length; i++) {
            addresses[i] = whitelistedBorrowers.at(i);
        }

        return addresses;
    }

    /** @dev adds lenders address to the whitelist.
     * @param a address to add to the whitelist
     */
    function addLender(address a) external onlyOwner {
        whitelistedLenders.add(a);
    }

    /** @dev removes lenders address from the whitelist.
     * @param a address to remove from the whitelist
     */
    function removeLender(address a) external onlyOwner {
        whitelistedLenders.remove(a);
    }

    /** @dev checks if the lender address is in the whitelist.
     * @param a address to check
     * @return true if the address is in the whitelist
     */
    function isWhitelistedLender(address a) external view returns (bool) {
        return whitelistedLenders.contains(a);
    }

    /** @dev returns array of all whitelisted lender addresses  */
    function allLenders() external view returns (address[] memory) {
        uint length = whitelistedLenders.length();
        address[] memory addresses = new address[](length);
        for (uint i; i < length; i++) {
            addresses[i] = whitelistedLenders.at(i);
        }

        return addresses;
    }
}
