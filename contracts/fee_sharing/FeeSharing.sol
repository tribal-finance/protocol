// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "../staking/IStaking.sol";
import "./IFeeSharing.sol";
import "../authority/AuthorityAware.sol";

contract FeeSharing is IFeeSharing, Initializable, AuthorityAware {
    using MathUpgradeable for uint;

    uint public constant WAD = 10 ** 18;

    IERC20 public assetContract;
    address[] public beneficiaries;
    uint[] public beneficiariesSharesWad;

    /** @notice initializer
     *  IMPORTANT: the assumption is that the first beneficiary is the staking contract
     *  @param _authority address of the Authority contract
     *  @param _assetContract address of the asset contract (USDC)
     *  @param _beneficiaries array of addresses of the beneficiaries where the funds will be distributed
     *  @param _beneficiariesSharesWad array of shares of the beneficiaries where the funds will be distributed (in WAD. 100% = 10**18)
     */
    function initialize(
        address _authority,
        IERC20 _assetContract,
        address[] calldata _beneficiaries,
        uint[] calldata _beneficiariesSharesWad
    ) external initializer {
        assetContract = _assetContract;

        __Ownable_init();
        __AuthorityAware__init(_authority);
        updateBenificiariesAndShares(_beneficiaries, _beneficiariesSharesWad);
    }

    /** @notice update the beneficiaries and their shares
     *  IMPORTANT: the assumption is that the first beneficiary is the staking contract
     */
    function updateBenificiariesAndShares(
        address[] calldata _beneficiaries,
        uint[] calldata _beneficiariesSharesWad
    ) public onlyOwnerOrAdmin {
        require(
            _beneficiaries.length == _beneficiariesSharesWad.length,
            "beneficiaries and shares must have the same length"
        );
        _validateShares(_beneficiariesSharesWad);
        beneficiaries = _beneficiaries;
        beneficiariesSharesWad = _beneficiariesSharesWad;
    }

    /** @notice update the beneficiaries shares
     *   @param shareWads array of shares of the beneficiaries where the funds will be distributed (in WAD. 100% = 10**18)
     */
    function updateShares(uint[] calldata shareWads) external onlyOwnerOrAdmin {
        require(shareWads.length == beneficiaries.length, "beneficiaries and shares must have the same length");
        _validateShares(shareWads);
        beneficiariesSharesWad = shareWads;
    }

    function _validateShares(uint[] calldata shareWads) internal pure {
        uint sum = 0;
        for (uint i = 0; i < shareWads.length; i++) {
            sum += shareWads[i];
        }
        require(sum == WAD, "shares must sum to 100%");
    }

    /** @notice distribute the collected fees to the beneficiaries
     *  IMPORTANT: the assumption is that the first beneficiary is the staking contract
     */
    function distributeFees() external onlyOwnerOrAdmin {
        uint balance = assetContract.balanceOf(address(this));
        // distribute shares
        for (uint i = 0; i < beneficiaries.length; i++) {
            uint amount = balance.mulDiv(beneficiariesSharesWad[i], WAD, MathUpgradeable.Rounding.Down);
            if (amount > 0) {
                if (i == 0) {
                    address stakingAddress = beneficiaries[i];
                    // first beneficiary is the staking contract.
                    SafeERC20.safeApprove(assetContract, stakingAddress, amount);
                    // Call addFunds on the contract
                    IStaking(stakingAddress).addReward(amount);
                } else {
                    // otherwise just transfer funds to benificiary
                    SafeERC20.safeTransfer(assetContract, beneficiaries[i], amount);
                }
            }
        }
    }

    /// @notice returns the address of the staking contract
    function stakingContract() public view returns (address) {
        return beneficiaries[0];
    }
}
