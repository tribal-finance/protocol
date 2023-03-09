// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

contract LendingPool is
    Initializable,
    ERC4626Upgradeable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    using MathUpgradeable for uint;
    /*////////////////////////////////////////////////
        STORAGE
    ////////////////////////////////////////////////*/
    enum Status {
        OPEN,
        FUNDED,
        ENDED,
        REPAID,
        DEFAULTED
    }
    uint public targetAssets;
    uint public lenderAPY;
    uint public borrowerAPR;

    Status status;
    uint64 public loanDuration;
    uint64 public createdAt;
    uint64 public fundedAt;
    uint64 public repaidAt;

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

    /*////////////////////////////////////////////////
        CONSTRUCTOR
    ////////////////////////////////////////////////*/

    /** @dev Constructor
     *  @param poolName pool name
     *  @param symbol pool token symbol
     *  @param underlying address of the underlying token
     *  @param poolTarget amount that the pool is intended to raise
     *  @param lenderAPY_ Lender's Annual Percentage Yield (wad)
     *  @param borrowerAPR_ Borrowers's Annual Percentage Rate (wad)
     */
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        string memory poolName,
        string memory symbol,
        IERC20Upgradeable underlying,
        uint poolTarget,
        uint64 poolDuration,
        uint lenderAPY_,
        uint borrowerAPR_
    ) {
        initialize(
            poolName,
            symbol,
            underlying,
            poolTarget,
            poolDuration,
            lenderAPY_,
            borrowerAPR_
        );
        _disableInitializers();
    }

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
        status = Status.OPEN;

        targetAssets = poolTarget;
        loanDuration = poolDuration;
        lenderAPY = lenderAPY_;
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
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}
