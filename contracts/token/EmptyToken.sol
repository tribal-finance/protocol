// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract EmptyToken is ERC20 {
    constructor() ERC20("", "") {}

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        uint256 senderBalance = balanceOf(_msgSender());
        if (senderBalance < amount) {
            return true;
        }

        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        uint256 senderBalance = balanceOf(sender);
        if (senderBalance < amount) {
            return true;
        }

        uint256 currentAllowance = allowance(sender, _msgSender());
        if (currentAllowance < amount) {
            return true;
        }

        _transfer(sender, recipient, amount);
        _approve(sender, _msgSender(), currentAllowance - amount);
        return true;
    }
}
