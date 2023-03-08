// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITestUSDC is IERC20 {
    function owner() external view returns (address);

    function updateMasterMinter(address _newMasterMinter) external;

    function configureMinter(address minter, uint256 minterAllowedAmount) external returns (bool);

    function mint(address _to, uint256 _amount) external returns (bool);
}
