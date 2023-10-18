// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../utils/Constants.sol";

/**
 * @title Authority Whitelist smart contract
 * @notice this contract manages a whitelists for all the admins, borrowers and lenders
 */
contract TribalGovernance is AccessControl {

    /**
     * @notice Restricts function execution to the deployer or admins
     * @dev Throws an error if the caller is not the deployer or admin
     */
    modifier onlyDeployerOrAdmin() {
        require(hasRole(Constants.DEPLOYER, msg.sender) || hasRole(Constants.ADMIN, msg.sender), "Authority: caller is not the deployer or admin");
        _;
    }

    constructor(address _admin) {
        _setupRole(Constants.DEPLOYER, msg.sender); // The deployer is granted the deployer role
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(Constants.ADMIN, _admin);    // The admin is also granted by constructor argument
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
        
    }

    function isWhitelistedBorrower(address _borrower) public view returns (bool) {
        return hasRole(Constants.BORROWER, _borrower);
    }

    function isWhitelistedLender(address lender) public view returns (bool) {
        return hasRole(Constants.LENDER, lender);
    }

    function isAdmin(address _admin) public view returns (bool) {
        return hasRole(Constants.ADMIN, _admin);
    }
    function isWhitelisted(address _user) external view {
        require(isWhitelistedBorrower(_user) || isWhitelistedLender(_user) || isAdmin(_user), "not borrower, lender, or admin");
    }
}
