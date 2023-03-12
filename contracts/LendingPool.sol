// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "hardhat/console.sol";

contract LendingPool is
    Initializable,
    ERC4626Upgradeable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    using MathUpgradeable for uint;

    enum Stages {
        INITIAL,
        OPEN,
        FUNDED,
        ENDED,
        REPAID,
        DEFAULTED
    }

    struct Rewardable {
        uint stake;
        uint64 start;
        bool isBoosted;
    }

    /*////////////////////////////////////////////////
        STORAGE
    ////////////////////////////////////////////////*/
    uint public targetAssets;
    uint public lenderAPY;
    uint public boostedLenderAPY;
    uint public borrowerAPR;

    Stages public stage;
    uint64 public loanDuration;
    uint64 public createdAt;
    uint64 public fundedAt;
    uint64 public repaidAt;

    mapping(address => Rewardable) rewardables;
    mapping(address => uint) rewardCorrections;
    mapping(address => uint) rewardWithdrawals;
    mapping(address => bool) rewardBoosts;

    /*////////////////////////////////////////////////
        MODIFIERS
    ////////////////////////////////////////////////*/
    modifier atStage(Stages _stage) {
        require(stage == _stage, "wrong stage");
        _;
    }

    /*////////////////////////////////////////////////
        CONSTRUCTOR
    ////////////////////////////////////////////////*/

    /** @dev  Initializer
     *  @param poolName pool name
     *  @param symbol pool token symbol
     *  @param underlying address of the underlying token
     *  @param poolTarget amount that the pool is intended to raise
     *  @param lenderAPY_ Lender's Annual Percentage Yield (wad)
     *  @param borrowerAPR_ Borrowers's Annual Percentage Rate (wad)
     */
    function initialize(
        string memory poolName,
        string memory symbol,
        IERC20Upgradeable underlying,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY_,
        uint borrowerAPR_
    ) public initializer {
        createdAt = uint64(block.timestamp);
        stage = Stages.OPEN;

        targetAssets = poolTarget;
        loanDuration = poolDuration;
        lenderAPY = lenderAPY_;
        boostedLenderAPY = lenderAPY_;
        borrowerAPR = borrowerAPR_;

        string memory tokenName = string(abi.encodePacked(poolName, " Token"));
        __ERC20_init(tokenName, symbol);
        __Pausable_init();
        __Ownable_init();
        __ERC4626_init(underlying);
    }

    /*////////////////////////////////////////////////
        SECURITY METHODS
    ////////////////////////////////////////////////*/

    /** @dev Pauses the pool */
    function pause() public onlyOwner {
        _pause();
    }

    /** @dev Unpauses the pool */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     *  @dev withraws all the pool funds to receiver address
     */
    function drain(address receiver) public onlyOwner whenPaused {
        SafeERC20Upgradeable.safeTransfer(
            _assetToken(),
            receiver,
            _assetToken().balanceOf(address(this))
        );
    }

    /*////////////////////////////////////////////////
        ERC4626Upgradeable overrides
    ////////////////////////////////////////////////*/

    /** @dev See {IERC4626-deposit}. */
    function deposit(
        uint256 assets,
        address receiver
    ) public override whenNotPaused atStage(Stages.OPEN) returns (uint256) {
        return super.deposit(assets, receiver);
    }

    /** @dev See {IERC4626-mint}. */
    function mint(
        uint256 shares,
        address receiver
    ) public override whenNotPaused atStage(Stages.OPEN) returns (uint256) {
        return super.mint(shares, receiver);
    }

    /** @dev See {IERC4626-withdraw}. */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override whenNotPaused atStage(Stages.REPAID) returns (uint256) {
        return super.withdraw(assets, receiver, owner);
    }

    /** @dev See {IERC4626-redeem}. */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused atStage(Stages.REPAID) returns (uint256) {
        return super.redeem(shares, receiver, owner);
    }

    /** @dev See {IERC4626-totalAssets}. */
    function totalAssets() public view override returns (uint256) {
        return convertToAssets(totalSupply()); // TODO: interest?
    }

    /** @dev See {IERC4626-maxDeposit}. */
    function maxDeposit(address) public view override returns (uint256) {
        if (stage != Stages.OPEN) {
            return 0;
        }
        if (totalAssets() >= targetAssets) {
            return 0;
        }
        return targetAssets - totalAssets();
    }

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(address) public view override returns (uint256) {
        return convertToShares(maxDeposit(msg.sender));
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(
        address owner
    ) public view virtual override returns (uint256) {
        return 0; // TODO: temporarily disabled
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(
        address owner
    ) public view virtual override returns (uint256) {
        return 0; // TODO:temporarily disabled
    }

    /** @dev will return 1:1 */
    function _convertToShares(
        uint256 assets,
        MathUpgradeable.Rounding rounding
    ) internal view override returns (uint256 shares) {
        return _initialConvertToShares(assets, rounding);
    }

    /** @dev will return 1:1 */
    function _convertToAssets(
        uint256 shares,
        MathUpgradeable.Rounding rounding
    ) internal view override returns (uint256 assets) {
        return _initialConvertToAssets(shares, rounding); // 1:1
    }

    /**
     * @dev deposit/mint common workflow
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._deposit(caller, receiver, assets, shares);

        rewardables[receiver] = Rewardable(
            balanceOf(receiver),
            uint64(block.timestamp),
            false
        );

        if (totalSupply() == targetAssets && stage == Stages.OPEN) {
            fundedAt = uint64(block.timestamp);
            stage = Stages.FUNDED;
            // TODO: emit funded event
        }
    }

    /*////////////////////////////////////////////////
        ERC20Upgradeable overrides
    ////////////////////////////////////////////////*/
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(false, "ERC20 transfer is not supported");
        // When alice transfers tokens to Bob:
        // 1. get Alice rewardsWithdrawable()
        // 2. add them rewardCorrections
        // 3. update Alice rewardable with stake = currentStake - amount and start = block.timestamp
        // 4. transfer funds and make sure bob stake is corrected with above ^
        // NOTE: use _beforeTransfer() and _afterTransfer()
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /*////////////////////////////////////////////////
        REWARDS
    ////////////////////////////////////////////////*/
    function withdrawRewards() external payable whenNotPaused {
        uint toWithdraw = rewardsWitdrawable(_msgSender());
        require(
            toWithdraw > 10 ** decimals(),
            "withdrawRewards: minimum withdrawal is 1 USDC"
        );

        rewardWithdrawals[_msgSender()] = toWithdraw;
        SafeERC20Upgradeable.safeTransfer(
            _assetToken(),
            _msgSender(),
            toWithdraw
        );
    }

    function rewardsGeneratedByDate(
        address receiver
    ) public view returns (uint256 totalRewards) {
        Rewardable memory rewardable = rewardables[receiver];
        if (
            rewardable.stake == 0 ||
            stage < Stages.FUNDED ||
            stage == Stages.DEFAULTED
        ) {
            return 0;
        }

        uint256 start = MathUpgradeable.max(
            uint256(fundedAt),
            uint256(rewardable.start)
        );
        uint256 end = MathUpgradeable.min(
            uint256(fundedAt + loanDuration),
            block.timestamp
        );

        uint256 stakeDuration = end - start;

        // targetAssets * stakeDuration * adjustedAPY / loanDuration
        uint256 calculatedRewards = targetAssets
            .mulDiv(stakeDuration, loanDuration)
            .mulDiv(adjustedLenderAPY(), 10 ** 18);

        return rewardCorrections[receiver] + calculatedRewards;
    }

    function rewardsWitdrawable(
        address receiver
    ) public view returns (uint256 withdrawable) {
        return rewardsGeneratedByDate(receiver) - rewardWithdrawals[receiver];
    }

    /**
     * @return adj lender APY adjusted by duration of the loan
     */
    function adjustedLenderAPY() public view returns (uint adj) {
        adj = lenderAPY.mulDiv(loanDuration, 365 * 24 * 60 * 60);
    }

    function expectedLenderYield() public view returns (uint yld) {
        yld = adjustedLenderAPY().mulDiv(targetAssets, 10 ** 18);
    }

    /**
     * @return adj borrower interest rate adjusted by duration of the loan
     */
    function adjustedBorrowerAPR() public view returns (uint adj) {
        adj = borrowerAPR.mulDiv(loanDuration, 365 * 24 * 60 * 60);
    }

    function expectedBorrowerInterest() public view returns (uint interest) {
        interest = adjustedBorrowerAPR().mulDiv(targetAssets, 10 ** 18);
    }

    function _assetToken() internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(asset());
    }
}
