// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
interface IStaking {
    function token() external view returns (IERC20);
    function rewardToken() external view returns (IERC20);
    function rewardPerTokenStaked() external view returns (uint256);
    function totalStaked() external view returns (uint256);
    function staked(address user) external view returns (uint256);
    function lastUpdateTime(address user) external view returns (uint256);
    function rewardEarned(address user) external view returns (uint256);
    function claimableReward(address user) external view returns (uint256);

    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimReward() external;
    function addReward(uint256 amount) external;
}