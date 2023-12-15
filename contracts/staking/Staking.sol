// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../governance/TribalGovernance.sol";
import "./IStaking.sol";

/** @title Staking smart contract
 *  @notice This contract allows users to stake PLATFORM tokens and part of platform fee shares
 *  The contract is heavily inspired by https://solidity-by-example.org/defi/discrete-staking-rewards/
 *  You can see the math explanation in this video: https://www.youtube.com/watch?v=mo6rHnDU8us&t=728s
 *  In addition to that, I want to mention that it is inspired by Synthetix staking contract
 */
contract Staking is IStaking, Initializable {
    /*///////////////////////////////////
       CONSTANTS
    ///////////////////////////////////*/
    uint private constant WAD = 10 ** 18;
    struct UnstakeRequest {
        uint amount;
        uint timestampExecutable;
    }

    /*///////////////////////////////////
       STATE VARIABLES
    ///////////////////////////////////*/
    /// @notice The ERC-20 token being staked (PLATFORM)
    ERC20Upgradeable public stakingToken;
    /// @notice the ERC-20 token used for rewards (USDC)
    ERC20Upgradeable public rewardToken;
    /// @notice cooldown period in seconds
    uint public cooldownPeriodSeconds;
    /// @notice Total amount of PLATFORM staked by each user
    mapping(address => uint) public stakedBalanceOf;
    /// @notice Total amount of PLATFORM staked by all users
    uint public totalSupply;
    /// @dev current reward index
    uint private rewardIndex;
    /// @dev user reward indexes
    mapping(address => uint) private rewardIndexOf;
    /// @dev how much rewards each user has already earned
    mapping(address => uint) private earned;
    /// @dev unstake requests
    mapping(address => UnstakeRequest) public unstakeRequests;

    TribalGovernance public governance;

    /*///////////////////////////////////
       EVENTS
    ///////////////////////////////////*/
    event Staked(address indexed user, uint256 amount);
    event UnstakeRequested(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event NewRewards(address indexed sender, uint256 totalAmount);
    event RewardsClaimed(address indexed user, uint256 amount);

    /*///////////////////////////////////
       INITIALIZER
    ///////////////////////////////////*/
    /** @notice Initialize the contract
     *  @param _governance Address of the Authority contract
     *  @param _stakingToken Address of the PLATFORM token
     *  @param _rewardToken Address of the USDC token
     *  @param _cooldownPeriodSeconds Cooldown period in seconds
     */
    function initialize(
        TribalGovernance _governance,
        ERC20Upgradeable _stakingToken,
        ERC20Upgradeable _rewardToken,
        uint256 _cooldownPeriodSeconds
    ) public initializer {
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        cooldownPeriodSeconds = _cooldownPeriodSeconds;
        governance = _governance;
    }

    constructor() {
        _disableInitializers();
    }

    /*///////////////////////////////////
        ADDITION OF REWARDS
    ///////////////////////////////////*/
    /** @notice Add rewards to the pool
     *  @param amount Amount of rewards to add
     */
    function addReward(uint256 amount) external {
        require(totalSupply > 0, "No Stakers");
        SafeERC20Upgradeable.safeTransferFrom(rewardToken, msg.sender, address(this), amount);
        rewardIndex += (amount * WAD) / totalSupply;
    }

    /*///////////////////////////////////
        STAKING FUNCTIONS
    ///////////////////////////////////*/
    /** @notice Stake PLATFORM tokens
     *  @param amount Amount of PLATFORM tokens to stake
     */
    function stake(uint256 amount) external {
        require(governance.isWhitelisted(msg.sender), "not whitelisted");
        require(amount > 0, "Amount must be greater than 0");
        require(stakingToken.balanceOf(msg.sender) >= amount, "Insufficient balance");

        _updateRewards(msg.sender);

        stakedBalanceOf[msg.sender] += amount;
        totalSupply += amount;

        SafeERC20Upgradeable.safeTransferFrom(stakingToken, msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    /** @notice Unstake requested amount of PLATFORM tokens
     *  You should call requestUnstake() and wait for the cooldown period to pass before calling this function
     */
    function unstake() external {
        require(governance.isWhitelisted(msg.sender), "not whitelisted");
        UnstakeRequest storage r = unstakeRequests[msg.sender];
        require(r.timestampExecutable > 0, "No unstake request");
        require(block.timestamp >= r.timestampExecutable, "Cooldown period not passed");

        uint toSend = r.amount;
        // Clear the existing unstake request
        r.amount = 0;
        r.timestampExecutable = 0;

        SafeERC20Upgradeable.safeTransfer(stakingToken, msg.sender, toSend);
        emit Unstaked(msg.sender, r.amount);
    }

    /** @notice Request to unstake PLATFORM tokens
     *  @param amount Amount of PLATFORM tokens to unstake
     */
    function requestUnstake(uint256 amount) external {
        require(governance.isWhitelisted(msg.sender), "not whitelisted");
        require(amount > 0, "Amount must be greater than 0");
        require(stakedBalanceOf[msg.sender] >= amount, "Insufficient staked balance");
        require(unstakeRequests[msg.sender].timestampExecutable == 0, "Unstake request already exists");
        _updateRewards(msg.sender);
        stakedBalanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        UnstakeRequest memory request = UnstakeRequest(amount, block.timestamp + cooldownPeriodSeconds);
        unstakeRequests[msg.sender] = request;

        emit UnstakeRequested(msg.sender, amount);
    }

    /// @notice Claim rewards
    function claimReward() external returns (uint256) {
        require(governance.isWhitelisted(msg.sender), "not whitelisted");
        _updateRewards(msg.sender);
        uint reward = earned[msg.sender];
        if (reward > 0) {
            earned[msg.sender] = 0;
            SafeERC20Upgradeable.safeTransfer(rewardToken, msg.sender, reward);
            emit RewardsClaimed(msg.sender, reward);
        }

        return reward;
    }

    /** @notice Calculate rewards earned by a user
     *  @param account Address of the user
     *  @return Amount of USDC earned in rewards
     */
    function calculateRewardsEarned(address account) external view returns (uint256) {
        return earned[account] + _calculateRewards(account);
    }

    /*///////////////////////////////////
        HELPERS
    ///////////////////////////////////*/
    // Calculate rewards earned by the user
    function _updateRewards(address account) private {
        // Users do not get rewards on cooldown

        earned[account] += _calculateRewards(account);
        rewardIndexOf[account] = rewardIndex;
    }

    /** @dev Calculate rewards earned by a user
     * @param account Address of the user
     * @return Amount of rewards earned
     */
    function _calculateRewards(address account) private view returns (uint) {
        uint shares = stakedBalanceOf[account];
        return (shares * (rewardIndex - rewardIndexOf[account])) / WAD;
    }
}
