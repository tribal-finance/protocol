// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./LendingPool.sol";

import "../factory/PoolFactory.sol";
import "../vaults/TrancheVault.sol";

library PoolTransfers {


    function executeRollover(
        LendingPool lendingPool,
        address deadLendingPoolAddr,
        address[] memory deadTrancheAddrs,
        uint256 lenderStartIndex,
        uint256 lenderEndIndex
    ) external {
        uint256 tranchesCount = lendingPool.tranchesCount();
        require(tranchesCount == deadTrancheAddrs.length, "tranche array mismatch");
        require(
            keccak256(deadLendingPoolAddr.code) == keccak256(address(this).code),
            "rollover incampatible due to version mismatch"
        ); // upgrades to the next contract need to be set before users are allowed to rollover in the current contract
        // should do a check to ensure there aren't more than n protocols running in parallel, if this is true, the protocol will revert for reasons unknown to future devs
        LendingPool deadpool = LendingPool(deadLendingPoolAddr);
        for (uint256 i = lenderStartIndex; i <= lenderEndIndex; i++) {
            address lender = deadpool.lendersAt(i);
            LendingPool.RollOverSetting memory settings = LendingPool(deadLendingPoolAddr).lenderRollOverSettings(lender);
            if (!settings.enabled) {
                continue;
            }

            for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                TrancheVault vault = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
                uint256 rewards = settings.rewards ? deadpool.lenderRewardsByTrancheRedeemable(lender, trancheId) : 0;
                // lenderRewardsByTrancheRedeemable will revert if the lender has previously withdrawn
                // transfer rewards from dead lender to dead tranche
                SafeERC20.safeTransferFrom(
                    IERC20(lendingPool.stableCoinContractAddress()),
                    deadLendingPoolAddr,
                    deadTrancheAddrs[trancheId],
                    rewards
                );

                vault.rollover(lender, deadTrancheAddrs[trancheId], rewards);
            }

            // ask deadpool to move platform token into this new contract
            IERC20 platoken = IERC20(lendingPool.platformTokenContractAddress());
            uint256 platokens = platoken.allowance(deadLendingPoolAddr, address(this));
            SafeERC20.safeTransferFrom(platoken, deadLendingPoolAddr, address(this), platokens);
        }
    }
}
