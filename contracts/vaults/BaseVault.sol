// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

contract BaseVault is
    Initializable,
    ERC4626Upgradeable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    /*////////////////////////////////////////////////
      State
    ////////////////////////////////////////////////*/

    /* poolAddress */
    address private s_poolAddress;
    event ChangePoolAddress(address oldValue, address newValue);

    function poolAddress() public view returns (address) {
        return s_poolAddress;
    }

    function _setPoolAddress(address newValue) internal {
        address oldValue = s_poolAddress;
        s_poolAddress = newValue;
        emit ChangePoolAddress(oldValue, newValue);
    }

    /* minFundingCapacity */
    uint256 private s_minFundingCapacity;
    event ChangeMinFundingCapacity(uint256 oldValue, uint256 newValue);

    function minFundingCapacity() public view returns (uint256) {
        return s_minFundingCapacity;
    }

    function _setMinFundingCapacity(uint256 newValue) internal {
        uint256 oldValue = s_minFundingCapacity;
        s_minFundingCapacity = newValue;
        emit ChangeMinFundingCapacity(oldValue, newValue);
    }

    function setMinFundingCapacity(uint256 newValue) external onlyOwner {
        _setMinFundingCapacity(newValue);
    }

    /* maxFundingCapacity */
    uint256 private s_maxFundingCapacity;
    event ChangeMaxFundingCapacity(uint256 oldValue, uint256 newValue);

    function maxFundingCapacity() public view returns (uint256) {
        return s_maxFundingCapacity;
    }

    function _setMaxFundingCapacity(uint256 newValue) internal {
        uint256 oldValue = s_maxFundingCapacity;
        s_maxFundingCapacity = newValue;
        emit ChangeMaxFundingCapacity(oldValue, newValue);
    }

    function setMaxFundingCapacity(uint256 newValue) external onlyOwner {
        _setMaxFundingCapacity(newValue);
    }

    /* withdrawEnabled */
    bool private s_withdrawEnabled;
    event ChangeWithdrawEnabled(
        address indexed actor,
        bool oldValue,
        bool newValue
    );

    function withdrawEnabled() public view returns (bool) {
        return s_withdrawEnabled;
    }

    function _setWithdrawEnabled(bool newValue) internal {
        bool oldValue = s_withdrawEnabled;
        s_withdrawEnabled = newValue;
        emit ChangeWithdrawEnabled(msg.sender, oldValue, newValue);
    }

    /* depositEnabled */
    bool private s_depositEnabled;
    event ChangeDepositEnabled(
        address indexed actor,
        bool oldValue,
        bool newValue
    );

    function depositEnabled() public view returns (bool) {
        return s_depositEnabled;
    }

    function _setDepositEnabled(bool newValue) internal {
        bool oldValue = s_depositEnabled;
        s_depositEnabled = newValue;
        emit ChangeDepositEnabled(msg.sender, oldValue, newValue);
    }

    /* transferEnabled */
    bool private s_transferEnabled;
    event ChangeTransferEnabled(
        address indexed actor,
        bool oldValue,
        bool newValue
    );

    function transferEnabled() public view returns (bool) {
        return s_transferEnabled;
    }

    function _setTransferEnabled(bool newValue) internal {
        bool oldValue = s_transferEnabled;
        s_transferEnabled = newValue;
        emit ChangeTransferEnabled(msg.sender, oldValue, newValue);
    }

    /*////////////////////////////////////////////////
      Modifiers
    ////////////////////////////////////////////////*/
    modifier onlyPool() {
        require(_msgSender() == poolAddress(), "Vault: onlyPool");
        _;
    }

    modifier onlyOwnerOrPool() {
        require(
            _msgSender() == poolAddress() || _msgSender() == owner(),
            "Vault: onlyOwnerOrPool"
        );
        _;
    }

    modifier onlyWhitelist() {
        require(
            _isWhitelisted(_msgSender()),
            "Vault: TODO: whitelists are not implemented yet."
        );
        _;
    }

    modifier whenWithdrawEnabled() {
        require(withdrawEnabled(), "Vault: withdraw disabled");
        _;
    }

    modifier whenDepositEnabled() {
        require(depositEnabled(), "Vault: deposit disabled");
        _;
    }

    modifier whenTransferEnabled() {
        require(transferEnabled(), "Vault: transfer disabled");
        _;
    }

    function _isWhitelisted(address) internal virtual returns (bool) {
        return true;
    }

    /*////////////////////////////////////////////////
      CONSTRUCTOR
    ////////////////////////////////////////////////*/
    function _baseInitializer(
        address _poolAddress,
        uint _minCapacity,
        uint _maxCapacity,
        string memory _tokenName,
        string memory _symbol,
        address underlying
    ) internal onlyInitializing {
        require(_minCapacity <= _maxCapacity, "Vault: min > max");
        _setPoolAddress(_poolAddress);
        _setMinFundingCapacity(_minCapacity);
        _setMaxFundingCapacity(_maxCapacity);
        __ERC20_init(_tokenName, _symbol);
        __Pausable_init();
        __Ownable_init();
        __ERC4626_init(IERC20Upgradeable(underlying));
    }

    /*////////////////////////////////////////////////
        ADMIN METHODS
    ////////////////////////////////////////////////*/

    /** @dev enables deposits to the vault */
    function enableDeposits() external onlyOwnerOrPool {
        _setDepositEnabled(true);
    }

    /** @dev disables deposits to the vault */
    function disableDeposits() external onlyOwnerOrPool {
        _setDepositEnabled(false);
    }

    /** @dev enables withdrawals from the vault*/
    function enableWithdrawals() external onlyOwnerOrPool {
        _setWithdrawEnabled(true);
    }

    /** @dev disables withdrawals from the vault*/
    function disableWithdrawals() external onlyOwnerOrPool {
        _setWithdrawEnabled(false);
    }

    /** @dev enables vault token transfers */
    function enableTransfers() external onlyOwnerOrPool {
        _setTransferEnabled(true);
    }

    /** @dev disables vault token transfers */
    function disableTransfers() external onlyOwnerOrPool {
        _setTransferEnabled(false);
    }

    /** @dev Pauses the pool */
    function pause() external onlyOwner {
        _pause();
    }

    /** @dev Unpauses the pool */
    function unpause() external onlyOwner {
        _unpause();
    }

    /** @dev called by the pool in order to send assets*/
    function sendAssetsToPool(uint assets) external onlyPool {
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(asset()),
            poolAddress(),
            assets
        );
    }

    /*////////////////////////////////////////////////
        ERC-4626 Overrides
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
    )
        public
        virtual
        override
        whenNotPaused
        onlyWhitelist
        whenDepositEnabled
        returns (uint256)
    {
        return super.deposit(assets, receiver);
    }

    /** @dev See {IERC4626-mint} */
    function mint(
        uint256 shares,
        address receiver
    )
        public
        virtual
        override
        whenNotPaused
        onlyWhitelist
        whenDepositEnabled
        returns (uint256)
    {
        return super.mint(shares, receiver);
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
    ) public override whenNotPaused whenWithdrawEnabled returns (uint256) {
        return super.withdraw(assets, receiver, owner);
    }

    /** @dev See {IERC4626-redeem}. */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused whenWithdrawEnabled returns (uint256) {
        return super.redeem(shares, receiver, owner);
    }

    /** @dev Maximum amount of assets that the vault will accept
     *  See {IERC4626-maxDeposit}.
     *  @param . lender address (just set it to msg sender)
     *  @return maximum amount of assets that can be deposited to the pool
     */
    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || !depositEnabled()) {
            return 0;
        }
        if (totalAssets() >= maxFundingCapacity()) {
            return 0;
        }
        return maxFundingCapacity() - totalAssets();
    }

    /** @dev See {IERC4626-totalAssets}. */
    function totalAssets() public view override returns (uint256) {
        return convertToAssets(totalSupply());
    }

    /** @dev See {IERC4626-maxMint}. */
    function maxMint(address) public view override returns (uint256) {
        return convertToShares(maxDeposit(msg.sender));
    }

    /** @dev See {IERC4626-maxWithdraw}. */
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (paused() || !withdrawEnabled()) {
            return 0;
        }
        return
            _convertToAssets(balanceOf(owner), MathUpgradeable.Rounding.Down);
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(address owner) public view override returns (uint256) {
        if (paused() || !withdrawEnabled()) {
            return 0;
        }
        return balanceOf(owner);
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
        address,
        address,
        uint256
    ) internal override whenNotPaused whenTransferEnabled {
        revert("Transfers are not implemented");
    }
}
