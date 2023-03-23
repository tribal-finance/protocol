// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./BaseVault.sol";

contract TrancheVault is BaseVault {
    /*////////////////////////////////////////////////
      State
    ////////////////////////////////////////////////*/

    /* id */
    int8 private s_id;
    event ChangeId(int8 oldValue, int8 newValue);

    function id() public view returns (int8) {
        return s_id;
    }

    function _setId(int8 newValue) internal {
        int8 oldValue = s_id;
        s_id = newValue;
        emit ChangeId(oldValue, newValue);
    }

    function initialize(
        address _poolAddress,
        int8 _trancheId,
        uint _minCapacity,
        uint _maxCapacity,
        string memory _tokenName,
        string memory _symbol,
        address underlying
    ) external initializer onlyOwner {
        _baseInitializer(
            _poolAddress,
            _minCapacity,
            _maxCapacity,
            _tokenName,
            _symbol,
            underlying
        );
        _setId(_trancheId);
    }
}
