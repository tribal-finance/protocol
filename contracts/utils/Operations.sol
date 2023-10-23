// SPDX-License-Identifier: MIT

pragma solidity 0.8.18;

import "./Constants.sol";

library Operations {

    function wadPow(uint _xWad, uint _n) internal pure returns (uint) {
        uint xWad = _xWad;
        uint n = _n;
        uint result = n % 2 != 0 ? xWad : Constants.WAD;

        for (n /= 2; n != 0; n /= 2) {
            xWad = (xWad * xWad) / Constants.WAD;

            if (n % 2 != 0) {
                result = (result * xWad) / Constants.WAD;
            }
        }

        return result;
    }
}