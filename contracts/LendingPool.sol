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

    /*////////////////////////////////////////////////
        CONSTANTS
    ////////////////////////////////////////////////*/
    uint public constant WAD = 10 ** 18;
    uint public constant YEAR = 365 * 24 * 60 * 60;

    enum Stages {
        INITIAL,
        OPEN,
        FUNDED,
        BORROWED,
        BORROWER_INTEREST_REPAID,
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
    uint public borrowerInterestPaid;
    address public borrowerAddress;

    Stages public stage;
    uint64 public loanDuration;
    uint64 public createdAt;
    uint64 public fundedAt;
    uint64 public borrowedAt;
    uint64 public repaidAt;
    uint64 public defaultedAt;

    mapping(address => Rewardable) rewardables;
    mapping(address => uint) rewardCorrections;
    mapping(address => uint) rewardWithdrawals;
    mapping(address => bool) rewardBoosts;

    /*////////////////////////////////////////////////
        EVENTS
    ////////////////////////////////////////////////*/
    event PoolInitialized(
        string poolName,
        string symbol,
        address underlying,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY,
        uint borrowerAPR,
        address borrowerAddress
    );

    event StageChanged(
        Stages indexed fromStage,
        Stages indexed toStage,
        address msgSender
    );

    event LenderWithdrawRewards(
        address indexed lender,
        uint amount,
        uint allTimeRewardsAmount
    );

    event BorrowerBorrow(address indexed borrowerAddress, uint amount);
    event BorrowerPayInterest(address indexed borrowedAddress, uint amount);
    event BorrowerRepayPrincipal(address indexed borrowerAddress, uint amount);

    /*////////////////////////////////////////////////
        MODIFIERS
    ////////////////////////////////////////////////*/
    modifier atStage(Stages _stage) {
        require(stage == _stage, "STG");
        _;
    }

    modifier onlyBorrower() {
        require(_msgSender() == borrowerAddress, "OBRWR");
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
        uint borrowerAPR_,
        address borrowerAddress_
    ) public initializer {
        createdAt = uint64(block.timestamp);

        targetAssets = poolTarget;
        loanDuration = poolDuration;
        lenderAPY = lenderAPY_;
        boostedLenderAPY = lenderAPY_;
        borrowerAPR = borrowerAPR_;
        borrowerAddress = borrowerAddress_;

        string memory tokenName = string(abi.encodePacked(poolName, " Token"));
        __ERC20_init(tokenName, symbol);
        __Pausable_init();
        __Ownable_init();
        __ERC4626_init(underlying);

        emit PoolInitialized(
            poolName,
            symbol,
            address(underlying),
            poolTarget,
            poolDuration,
            lenderAPY_,
            borrowerAPR_,
            borrowerAddress_
        );
        _transitionToStage(Stages.OPEN);
    }

    /*////////////////////////////////////////////////
        ADMIN METHODS
    ////////////////////////////////////////////////*/

    /** @dev Pauses the pool */
    function pause() external onlyOwner {
        _pause();
    }

    /** @dev Unpauses the pool */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     *  @dev withraws all the pool funds to receiver address
     */
    function drain(address receiver) external onlyOwner whenPaused {
        SafeERC20Upgradeable.safeTransfer(
            _assetToken(),
            receiver,
            _assetToken().balanceOf(address(this))
        );
    }

    /** @dev changes stage */
    function changeStage(Stages _stage) external onlyOwner {
        _transitionToStage(_stage);
    }

    /*////////////////////////////////////////////////
        LENDER METHODS
    ////////////////////////////////////////////////*/
    /** @dev Deposit asset to the pool
     *      See {IERC4626-deposit}.
     * @param assets amount of underlying asset to deposit
     * @param receiver receiver address (just set it to msg sender)
     * @return amount of pool tokens minted for the deposit
     */
    function deposit(
        uint256 assets,
        address receiver
    ) public override whenNotPaused atStage(Stages.OPEN) returns (uint256) {
        return super.deposit(assets, receiver);
    }

    /** @dev Withdraw principal from the pool
     * See {IERC4626-withdraw}.
     * @param assets amount of underlying asset to withdraw
     * @param receiver address to which the underlying assets should be sent
     * @param owner owner of the principal (just use msg sender)
     * @return amount of pool tokens burned after withdrawal
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override whenNotPaused atStage(Stages.REPAID) returns (uint256) {
        return super.withdraw(assets, receiver, owner);
    }

    /** @dev Maximum amount of assets that the pool will accept
     *  See {IERC4626-maxDeposit}.
     *  @param . lender address (just set it to msg sender)
     *  @return maximum amount of assets that can be deposited to the pool
     */
    function maxDeposit(address) public view override returns (uint256) {
        if (stage != Stages.OPEN) {
            return 0;
        }
        if (totalAssets() >= targetAssets) {
            return 0;
        }
        return targetAssets - totalAssets();
    }

    /**
     * @dev deposit/mint common workflow
     * See {ERC4626Upgradeable-_deposit}.
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
            _transitionToStage(Stages.FUNDED);
            // TODO: emit funded event
        }
    }

    /*////////////////////////////////////////////////
        REWARDS
    ////////////////////////////////////////////////*/
    function lenderWithdrawRewards() external whenNotPaused {
        uint toWithdraw = lenderRewardsWitdrawable(_msgSender());
        console.log("toWithdraw", toWithdraw);
        require(toWithdraw > 1 * 10 ** decimals(), "MINWD");

        rewardWithdrawals[_msgSender()] += toWithdraw;
        SafeERC20Upgradeable.safeTransfer(
            _assetToken(),
            _msgSender(),
            toWithdraw
        );

        emit LenderWithdrawRewards(
            _msgSender(),
            toWithdraw,
            rewardWithdrawals[_msgSender()]
        );
    }

    function lenderRewardsGeneratedByDate(
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

        // stakedAssets * stakeDuration * adjustedAPY / (loanDuration)
        uint256 calculatedRewards = (rewardable.stake)
            .mulDiv(stakeDuration, loanDuration)
            .mulDiv(lenderAdjustedAPY(), WAD);

        return rewardCorrections[receiver] + calculatedRewards;
    }

    function lenderRewardsWitdrawable(
        address receiver
    ) public view returns (uint256 withdrawable) {
        return
            lenderRewardsGeneratedByDate(receiver) -
            rewardWithdrawals[receiver];
    }

    /// @dev adjusted lender APY adjusted by duration of the loan = lenderAPY * loanDuration / 365
    function lenderAdjustedAPY() public view returns (uint adj) {
        return lenderAPY.mulDiv(loanDuration, YEAR);
    }

    /// @dev expected amount of assets that will be rewarded to all the lenders
    function expectedAllLendersYield() public view returns (uint yld) {
        return lenderAdjustedAPY().mulDiv(targetAssets, WAD);
    }

    /*////////////////////////////////////////////////
        BORROWER
    ////////////////////////////////////////////////*/

    /** @dev sends assets from pool balance to borrower address
     *  @return amountSent amount of assets sent
     */
    function borrow()
        external
        atStage(Stages.FUNDED)
        onlyBorrower
        returns (uint256 amountSent)
    {
        require(
            _assetToken().balanceOf(address(this)) >= targetAssets,
            "B:NEF"
        );

        SafeERC20Upgradeable.safeTransfer(
            _assetToken(),
            borrowerAddress,
            targetAssets
        );

        _transitionToStage(Stages.BORROWED);
        emit BorrowerBorrow(borrowerAddress, targetAssets);

        return targetAssets;
    }

    function borrowerPayInterest(
        uint assets
    ) external atStage(Stages.BORROWED) onlyBorrower {
        require(assets <= borrowerOutstandingInterest(), "PI:TMAS");
        SafeERC20Upgradeable.safeTransferFrom(
            _assetToken(),
            _msgSender(),
            address(this),
            assets
        );

        borrowerInterestPaid += assets;

        if (borrowerInterestPaid == borrowerExpectedInterest()) {
            _transitionToStage(Stages.BORROWER_INTEREST_REPAID);
        }

        emit BorrowerPayInterest(borrowerAddress, assets);
    }

    function borrowerRepayPrincipal()
        external
        atStage(Stages.BORROWER_INTEREST_REPAID)
        onlyBorrower
    {
        SafeERC20Upgradeable.safeTransferFrom(
            _assetToken(),
            _msgSender(),
            address(this),
            targetAssets
        );

        _transitionToStage(Stages.REPAID);
        emit BorrowerRepayPrincipal(borrowerAddress, targetAssets);
    }

    /** @dev adjusted borrower interest rate = APR * duration / 365 days
     *  @return adj borrower interest rate adjusted by duration of the loan
     */
    function borrowerAdjustedAPR() public view returns (uint adj) {
        adj = borrowerAPR.mulDiv(loanDuration, YEAR);
    }

    /** @dev total interest to be paid by borrower = adjustedBorrowerAPR * targetAssets
     *  @return interest amount of assets to be repaid
     */
    function borrowerExpectedInterest() public view returns (uint interest) {
        interest = borrowerAdjustedAPR().mulDiv(targetAssets, WAD);
    }

    /** @dev outstanding borrower interest = expectedBorrowerInterest - borrowerInterestAlreadyPaid
     *  @return interest amount of outstanding assets to be repaid
     */
    function borrowerOutstandingInterest() public view returns (uint interest) {
        interest = borrowerExpectedInterest() - borrowerInterestPaid;
    }

    /*////////////////////////////////////////////////
        ERC4626Upgradeable overrides
    ////////////////////////////////////////////////*/

    /** @dev See {IERC4626-mint}. */
    function mint(
        uint256 shares,
        address receiver
    ) public override whenNotPaused atStage(Stages.OPEN) returns (uint256) {
        return super.mint(shares, receiver);
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

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(address) public view override returns (uint256) {
        return convertToShares(maxDeposit(msg.sender));
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(
        address
    ) public view virtual override returns (uint256) {
        return 0; // TODO: temporarily disabled
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(address) public view virtual override returns (uint256) {
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

    /*////////////////////////////////////////////////
        ERC20Upgradeable overrides
    ////////////////////////////////////////////////*/
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(false, "NOTRNSFR");
        // When alice transfers tokens to Bob:
        // 1. get Alice rewardsWithdrawable()
        // 2. add them rewardCorrections
        // 3. update Alice rewardable with stake = currentStake - amount and start = block.timestamp
        // 4. transfer funds and make sure bob stake is corrected with above ^
        // NOTE: use _beforeTransfer() and _afterTransfer()
        if (from == address(0) || to == address(0)) {
            return;
        }
        rewardCorrections[from] += lenderRewardsWitdrawable(from);
        rewardables[from].start = uint64(block.timestamp);
        rewardables[from].stake -= amount;

        rewardCorrections[to] += lenderRewardsWitdrawable(to);
        rewardables[to].start = uint64(block.timestamp);
        rewardables[to].stake += amount;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _assetToken() internal view returns (IERC20Upgradeable) {
        return IERC20Upgradeable(asset());
    }

    function _transitionToStage(Stages newStage) internal {
        Stages oldStage = stage;
        stage = newStage;
        emit StageChanged(oldStage, newStage, _msgSender());
    }
}
