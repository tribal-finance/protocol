// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

/**
 * @title ITribalGovernance Whitelist smart contract interface
 * @notice this contract manages a whitelists for all the admins, borrowers and lenders
 */
interface ITribalGovernance {
    function isWhitelistedBorrower(address) external view returns (bool);

    function isWhitelistedLender(address) external view returns (bool);

    function isAdmin(address) external view returns (bool);
}
