// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./BaseVault.sol";

contract FirstLossCapitalVault is BaseVault {
    /*////////////////////////////////////////////////
      Initializer
    ////////////////////////////////////////////////*/

    function initialize(
        address _poolAddress,
        uint _minCapacity,
        uint _maxCapacity,
        string memory _tokenName,
        string memory _symbol,
        address underlying
    ) external initializer {
        _baseInitializer(
            _poolAddress,
            _minCapacity,
            _maxCapacity,
            _tokenName,
            _symbol,
            underlying
        );
    }
}
