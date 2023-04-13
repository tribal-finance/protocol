// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./BaseVault.sol";
import "../pool/ILendingPool.sol";

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
        _baseInitializer(_poolAddress, _minCapacity, _maxCapacity, _tokenName, _symbol, underlying);
    }

    function poolSetDepositTarget(uint _depositTarget) external onlyPool {
        require(_depositTarget >= minFundingCapacity(), "deposit target < minFundingCapacity");
        require(_depositTarget <= maxFundingCapacity(), "deposit target > maxFundingCapacity");

        _setMinFundingCapacity(_depositTarget);
        _setMaxFundingCapacity(_depositTarget);
    }

    /*///////////////////////////////////////
      ERC4626Upgradeable overrides
    ///////////////////////////////////////*/

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        require(assets >= minFundingCapacity(), "minFundingCapacity not met");
        require(assets <= maxFundingCapacity(), "maxFundingCapacity not met");

        // If _asset is ERC777, `transferFrom` can trigger a reenterancy BEFORE the transfer happens through the
        // `tokensToSend` hook. On the other hand, the `tokenReceived` hook, that is triggered after the transfer,
        // calls the vault, which is assumed not malicious.
        //
        // Conclusion: we need to do the transfer before we mint so that any reentrancy would happen before the
        // assets are transferred and before the shares are minted, which is a valid state.
        // slither-disable-next-line reentrancy-no-eth
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(asset()), caller, address(this), assets);
        _mint(receiver, shares);

        emit Deposit(caller, receiver, assets, shares);
    }
}
