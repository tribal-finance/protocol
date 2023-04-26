// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./IStaking.sol";

contract Staking is IStaking, Initializable, OwnableUpgradeable {
    IERC20 public token; // The ERC-20 token being staked (TRIBL)
    IERC20 public rewardToken; // The ERC-20 token used for rewards (USDC)
    uint256 public rewardPerTokenStaked; // The amount of rewardToken per token staked
    uint256 public totalStaked; // The total amount of TRIBL token staked
    mapping(address => uint256) public staked; // The amount of token staked by each user
    mapping(address => uint256) public lastUpdateTime; // The last time rewards were updated for each user
    mapping(address => uint256) public rewardEarned; // The amount of reward earned by each user
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);

    function initialize(IERC20 _token, IERC20 _rewardToken) public initializer {
        token = _token;
        rewardToken = _rewardToken;
        __Ownable_init();
    }

    /// @notice Stake TRIBL tokens
    function stake(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");
        updateReward(msg.sender);
        token.transferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    /// @notice Withdraw TRIBL tokens
    function withdraw(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(staked[msg.sender] >= amount, "Insufficient staked balance");
        updateReward(msg.sender);
        token.transfer(msg.sender, amount);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        emit Withdrawn(msg.sender, amount);
    }

    // Claim rewards
    function claimReward() external {
        updateReward(msg.sender);
        uint256 reward = rewardEarned[msg.sender];
        if (reward > 0) {
            rewardEarned[msg.sender] = 0;
            rewardToken.transfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function claimableReward(address user) external view returns (uint256) {
        return rewardEarned[user] + calculateReward(msg.sender);
    }

    // Update rewards for a user
    function updateReward(address user) internal {
        if (staked[user] > 0) {
            uint256 reward = calculateReward(user);
            rewardEarned[user] += reward;
            lastUpdateTime[user] = block.timestamp;
        }
    }

    // Calculate rewards for a user
    function calculateReward(address user) internal view returns (uint256) {
        uint256 timeSinceLastUpdate = block.timestamp - lastUpdateTime[user];
        uint256 stakedAmount = staked[user];
        uint256 rewardPerToken = rewardPerTokenStaked;
        uint256 reward = (stakedAmount * rewardPerToken * timeSinceLastUpdate) / 1e18;
        return reward;
    }

    // Add more reward tokens to the contract
    function addReward(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        rewardToken.transferFrom(msg.sender, address(this), amount);
        rewardPerTokenStaked += (amount * 1e18) / totalStaked;
    }
}
