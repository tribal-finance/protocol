// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

library Constants {

    bytes32 constant internal POOL_STORAGE_READER = keccak256("POOL_STORAGE_READER");
    bytes32 constant internal POOL_STORAGE_WRITER = keccak256("POOL_STORAGE_WRITER");
    bytes32 constant internal DEPLOYER = keccak256("DEPLOYER");
    bytes32 constant internal ADMIN = keccak256("ADMIN");
    bytes32 constant internal LENDER = keccak256("LENDER");
    bytes32 constant internal BORROWER = keccak256("BORROWER");
    
}