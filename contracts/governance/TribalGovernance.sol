// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../utils/Constants.sol";
/**
 * @title Authority Whitelist smart contract
 * @notice this contract manages a whitelists for all the admins, borrowers and lenders
 */
contract TribalGovernance is AccessControl, Initializable {

    /**
     * @notice Restricts function execution to the deployer or admins
     * @dev Throws an error if the caller is not the deployer or admin
     */
    modifier onlyDeployerOrAdmin() {
        require(hasRole(Constants.DEPLOYER, msg.sender) || hasRole(Constants.ADMIN, msg.sender), "Authority: caller is not the deployer or admin");
        _;
    }

    function initialize(address _admin, address _owner) public initializer {
        _grantRole(Constants.OWNER, _owner);
        _grantRole(Constants.ADMIN, _owner);

        _grantRole(Constants.DEPLOYER, msg.sender);
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _grantRole(Constants.ADMIN, _admin);    

        _setRoleAdmin(Constants.PROTOCOL, Constants.ADMIN); // admin govern's protocol
        _setRoleAdmin(Constants.OWNER, Constants.PROTOCOL); // protocol govern's owners
    }

    constructor() {
        _disableInitializers();
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

    function isOwner(address _admin) public view returns (bool) {
        return hasRole(Constants.OWNER, _admin);
    }

    function isWhitelisted(address _user) external view returns (bool) {
        return isWhitelistedBorrower(_user) || isWhitelistedLender(_user) || isAdmin(_user);
    }
}
