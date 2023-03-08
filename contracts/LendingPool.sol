// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

// import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableMapUpgradeable.sol";

import "./LendingPoolStorage.sol";

contract LendingPool is
    Initializable,
    PausableUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    LendingPoolStorage
{
    using SafeERC20 for IERC20;
    using EnumerableMapUpgradeable for EnumerableMapUpgradeable.AddressToUintMap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address usdcAddress,
        address borrower,
        uint targetAmount,
        uint64 duration
    ) public initializer {
        // solium-disable-next-line security/no-block-members
        _createdAt = uint64(block.timestamp);
        USDC_ADDRESS = usdcAddress;

        _borrower = borrower;
        _targetAmount = targetAmount;
        _fundedAmount = 0;
        _duration = duration;

        __Pausable_init();
        __Ownable_init();
        __UUPSUpgradeable_init();
    }

    function depositPrincipal(uint256 amountUSDC) external {
        require(
            _fundedAmount + amountUSDC <= _targetAmount,
            "amount exceeds target"
        );
        USDCContract().safeTransferFrom(msg.sender, address(this), amountUSDC);
        _increaseStake(msg.sender, amountUSDC);
    }

    function withdrawPrincipal(uint256 amountUSDC) external {
        (, uint currentStake) = _lenderStakes.tryGet(msg.sender);
        require(currentStake >= amountUSDC, "not enough funds");

        _decreaseStake(msg.sender, amountUSDC);
        USDCContract().transfer(msg.sender, amountUSDC);
    }

    function _increaseStake(address addr, uint amount) internal {
        (, uint currentStake) = _lenderStakes.tryGet(addr);
        _lenderStakes.set(addr, currentStake + amount);
        _fundedAmount += amount;
    }

    function _decreaseStake(address addr, uint amount) internal {
        (, uint currentStake) = _lenderStakes.tryGet(addr);
        _lenderStakes.set(addr, currentStake - amount);
        _fundedAmount -= amount;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}
}
