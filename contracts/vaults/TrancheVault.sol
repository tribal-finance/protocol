// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./BaseVault.sol";
import "../pool/ILendingPool.sol";

contract TrancheVault is BaseVault {
    /*////////////////////////////////////////////////
      State
    ////////////////////////////////////////////////*/

    /* id */
    uint8 private s_id;
    event ChangeId(uint8 oldValue, uint8 newValue);

    function id() public view returns (uint8) {
        return s_id;
    }

    function _setId(uint8 newValue) internal {
        uint8 oldValue = s_id;
        s_id = newValue;
        emit ChangeId(oldValue, newValue);
    }

    function initialize(
        address _poolAddress,
        uint8 _trancheId,
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
        _setId(_trancheId);
    }

    /*///////////////////////////////////////
      ERC4626Upgradeable overrides
    ///////////////////////////////////////*/

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        // If _asset is ERC777, `transferFrom` can trigger a reenterancy BEFORE the transfer happens through the
        // `tokensToSend` hook. On the other hand, the `tokenReceived` hook, that is triggered after the transfer,
        // calls the vault, which is assumed not malicious.
        //
        // Conclusion: we need to do the transfer before we mint so that any reentrancy would happen before the
        // assets are transferred and before the shares are minted, which is a valid state.
        // slither-disable-next-line reentrancy-no-eth
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(asset()),
            caller,
            address(this),
            assets
        );
        _mint(receiver, shares);

        emit Deposit(caller, receiver, assets, shares);
        ILendingPool(poolAddress()).onTrancheDeposit(id(), receiver, assets);
    }

    /**
     * @dev Withdraw/redeem common workflow.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }

        _burn(owner, shares);
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(asset()),
            receiver,
            assets
        );

        emit Withdraw(caller, receiver, owner, assets, shares);
        ILendingPool(poolAddress()).onTrancheWithdraw(id(), owner, assets);
    }
}
