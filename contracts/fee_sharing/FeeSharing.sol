// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../staking/IStaking.sol";

contract FeeSharing is Initializable, OwnableUpgradeable {
    using MathUpgradeable for uint;

    uint constant public WAD = 10 ** 18;

    IERC20 public assetContract;
    IStaking public stakingContract;
    uint public stakingContractShareWad;

    function initialize(IERC20 _assetContract, IStaking _stakingContract, uint _stakingContractShareWad) public initializer {
        require(stakingContractShareWad <= WAD, "staking contract share must be less than 100%");
        assetContract = _assetContract;
        stakingContract = _stakingContract;
        stakingContractShareWad = _stakingContractShareWad;
        
        __Ownable_init();
    }

    function setStakingContractShareWad(uint feeWad) external onlyOwner {
        require(feeWad <= WAD, "staking contract share must be less than 100%");
        stakingContractShareWad = feeWad;
    }

    /// @notice This function is called by the pools when someone tries to deposit tokens
    function deposit(uint assets) external {
        SafeERC20.safeTransferFrom(assetContract, msg.sender, address(this), assets);
        uint assetsForStaking = stakingContractShareWad.mulDiv(assets, WAD, MathUpgradeable.Rounding.Up);
        SafeERC20.safeApprove(assetContract, address(stakingContract), assetsForStaking);
        stakingContract.addReward(assetsForStaking);
    }
}