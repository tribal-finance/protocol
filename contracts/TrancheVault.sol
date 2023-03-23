// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/interfaces/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

contract TrancheVault is
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

    /* id */
    int8 private s_id;
    event ChangeId(int8 oldValue, int8 newValue);

    function id() public view returns (int8) {
        return s_id;
    }

    function _setId(int8 newValue) internal {
        int8 oldValue = s_id;
        s_id = newValue;
        emit ChangeId(oldValue, newValue);
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

    /*////////////////////////////////////////////////
      Modifiers
    ////////////////////////////////////////////////*/
    modifier onlyPool() {
        require(_msgSender() == poolAddress(), "TV: onlyPool");
        _;
    }

    modifier onlyWhitelist() {
        require(true, "TV: TODO: whitelists are not implemented yet.");
        _;
    }

    /*////////////////////////////////////////////////
      CONSTRUCTOR
    ////////////////////////////////////////////////*/
    function initialize(
        address _poolAddress,
        int8 _trancheId,
        uint _minCapacity,
        uint _maxCapacity,
        string memory _tokenName,
        string memory _symbol,
        IERC20Upgradeable underlying
    ) external initializer onlyOwner {
        require(_minCapacity <= _maxCapacity, "TV: min > max");
        _setPoolAddress(_poolAddress);
        _setId(_trancheId);
        _setMinFundingCapacity(_minCapacity);
        _setMaxFundingCapacity(_maxCapacity);
        __ERC20_init(_tokenName, _symbol);
        __Pausable_init();
        __Ownable_init();
        __ERC4626_init(underlying);
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
    ) public override whenNotPaused onlyWhitelist returns (uint256) {
        return super.deposit(assets, receiver);
    }

    /** @dev See {IERC4626-mint} */
    function mint(
        uint256 shares,
        address receiver
    ) public override whenNotPaused onlyWhitelist returns (uint256) {
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
    ) public override whenNotPaused onlyWhitelist returns (uint256) {
        return super.withdraw(assets, receiver, owner);
    }

    /** @dev See {IERC4626-redeem}. */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override whenNotPaused onlyWhitelist returns (uint256) {
        return super.redeem(shares, receiver, owner);
    }

    /** @dev Maximum amount of assets that the vault will accept
     *  See {IERC4626-maxDeposit}.
     *  @param . lender address (just set it to msg sender)
     *  @return maximum amount of assets that can be deposited to the pool
     */
    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) {
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
    function maxWithdraw(
        address owner
    ) public view virtual override returns (uint256) {
        if (paused()) {
            return 0;
        }
        return
            _convertToAssets(balanceOf(owner), MathUpgradeable.Rounding.Down);
    }

    /** @dev See {IERC4626-maxRedeem}. */
    function maxRedeem(
        address owner
    ) public view virtual override returns (uint256) {
        if (paused()) {
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
    function _transfer(address, address, uint256) internal pure override {
        revert("Transfers are not implemented");
    }
}
