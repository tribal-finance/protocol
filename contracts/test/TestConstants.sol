// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "../utils/Constants.sol";

contract TestConstants {
  // Function to get the WAD constant
    function getWAD() external pure returns (uint256) {
        return Constants.WAD;
    }

    // Function to get the YEAR constant
    function getYEAR() external pure returns (uint256) {
        return Constants.YEAR;
    }

    // Function to get the POOL_STORAGE_READER constant
    function getPoolStorageReader() external pure returns (bytes32) {
        return Constants.POOL_STORAGE_READER;
    }

    // Function to get the POOL_STORAGE_WRITER constant
    function getPoolStorageWriter() external pure returns (bytes32) {
        return Constants.POOL_STORAGE_WRITER;
    }

    // Function to get the DEPLOYER constant
    function getDeployer() external pure returns (bytes32) {
        return Constants.DEPLOYER;
    }

    // Function to get the ADMIN constant
    function getAdmin() external pure returns (bytes32) {
        return Constants.ADMIN;
    }

    // Function to get the OWNER constant
    function getOwner() external pure returns (bytes32) {
        return Constants.OWNER;
    }

    // Function to get the LENDER constant
    function getLender() external pure returns (bytes32) {
        return Constants.LENDER;
    }

    // Function to get the BORROWER constant
    function getBorrower() external pure returns (bytes32) {
        return Constants.BORROWER;
    }

    // Function to get the PROTOCOL constant
    function getProtocol() external pure returns (bytes32) {
        return Constants.PROTOCOL;
    }
}
