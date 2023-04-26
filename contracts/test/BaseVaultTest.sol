// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "../vaults/BaseVault.sol";

contract BaseVaultTest is BaseVault {
    function initialize(
        address _poolAddress,
        uint _minCapacity,
        uint _maxCapacity,
        string memory _tokenName,
        string memory _symbol,
        address underlying,
        address authority
    ) external initializer {
        _baseInitializer(_poolAddress, _minCapacity, _maxCapacity, _tokenName, _symbol, underlying, authority);
    }
}
