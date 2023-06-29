// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./LendingPool.sol";

import "../factory/PoolFactory.sol";
import "../vaults/TrancheVault.sol";

library PoolTransfers {



    function lenderEnableRollOver(LendingPool lendingPool, bool principal, bool rewards, bool platformTokens, address lender) external  {
        PoolFactory poolFactory = PoolFactory(lendingPool.poolFactoryAddress());
        uint256 lockedPlatformTokens;
        uint256 trancheCount = lendingPool.tranchesCount();
        for (uint8 trancheId; trancheId < trancheCount; trancheId++) {
            (uint256 staked,,,) = lendingPool.s_trancheRewardables(trancheId,lender);
            TrancheVault vault = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
            (,uint256 locked,,) = lendingPool.s_trancheRewardables(trancheId,lender);
            lockedPlatformTokens += locked;
            vault.approveRollover(lender, staked);
        }

        address[4] memory futureLenders = poolFactory.nextLenders();
        for (uint256 i = 0; i < futureLenders.length; i++) {
            SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(lendingPool.platformTokenContractAddress()), futureLenders[i], 0);
            // approve transfer of platform tokens
            SafeERC20Upgradeable.safeApprove(
                IERC20Upgradeable(lendingPool.platformTokenContractAddress()),
                futureLenders[i],
                lockedPlatformTokens
            );

            SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(lendingPool.stableCoinContractAddress()), futureLenders[i], 0);
            // approve transfer of the stablecoin contract
            SafeERC20Upgradeable.safeApprove(
                IERC20Upgradeable(lendingPool.stableCoinContractAddress()), // asume tranches.asset() == stablecoin address
                futureLenders[i],
                2 ** 256 - 1 // infinity approve because we don't know how much interest will need to be accounted for
            );
        }
    }


}