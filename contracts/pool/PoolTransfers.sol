// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./LendingPool.sol";

import "../factory/PoolFactory.sol";
import "../vaults/TrancheVault.sol";

library PoolTransfers {
    function lenderEnableRollOver(
        LendingPool lendingPool,
        bool principal,
        bool rewards,
        bool platformTokens,
        address lender
    ) external {
        PoolFactory poolFactory = PoolFactory(lendingPool.poolFactoryAddress());
        uint256 lockedPlatformTokens;
        uint256 trancheCount = lendingPool.tranchesCount();
        for (uint8 trancheId; trancheId < trancheCount; trancheId++) {
            (uint256 staked, , , ) = lendingPool.s_trancheRewardables(trancheId, lender);
            TrancheVault vault = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
            (, uint256 locked, , ) = lendingPool.s_trancheRewardables(trancheId, lender);
            lockedPlatformTokens += locked;
        }

        address[4] memory futureLenders = poolFactory.nextLenders();
        for (uint256 i = 0; i < futureLenders.length; i++) {
            SafeERC20.safeApprove(IERC20(lendingPool.platformTokenContractAddress()), futureLenders[i], 0);
            // approve transfer of platform tokens
            SafeERC20.safeApprove(
                IERC20(lendingPool.platformTokenContractAddress()),
                futureLenders[i],
                lockedPlatformTokens
            );

            SafeERC20.safeApprove(IERC20(lendingPool.stableCoinContractAddress()), futureLenders[i], 0);
            // approve transfer of the stablecoin contract
            SafeERC20.safeApprove(
                IERC20(lendingPool.stableCoinContractAddress()), // asume tranches.asset() == stablecoin address
                futureLenders[i],
                2 ** 256 - 1 // infinity approve because we don't know how much interest will need to be accounted for
            );
        }
    }

    function executeRollover(
        LendingPool lendingPool,
        address deadLendingPoolAddr,
        address[] memory deadTrancheAddrs,
        uint256 lenderStartIndex,
        uint256 lenderEndIndex
    ) external {
        uint256 tranchesCount = lendingPool.tranchesCount();
        // TODO: require all interest to be repaid
        LendingPool deadpool = LendingPool(deadLendingPoolAddr);
        require(deadpool.currentStage() == LendingPool.Stages.BORROWED, "must be in borrowed stage");
        require(deadpool.borrowerOutstandingInterest() == 0, "all interest must be repaid");
        require(lendingPool.borrowerAddress() == deadpool.borrowerAddress(), "borrowers must match");
        require(tranchesCount == deadTrancheAddrs.length, "tranche array mismatch");
        require(
            keccak256(deadLendingPoolAddr.code) == keccak256(address(this).code),
            "rollover incampatible due to version mismatch"
        ); // upgrades to the next contract need to be set before users are allowed to rollover in the current contract
        // should do a check to ensure there aren't more than n protocols running in parallel, if this is true, the protocol will revert for reasons unknown to future devs

        uint256 rolledAssets = 0;

        // TODO update pool so that we can enter repaid state
        for (uint256 i = lenderStartIndex; i <= lenderEndIndex; i++) {
            address lender = deadpool.lendersAt(i);
            LendingPool.RollOverSetting memory settings = LendingPool(deadLendingPoolAddr).lenderRollOverSettings(
                lender
            );
            if (!settings.enabled) {
                continue;
            }

            for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                TrancheVault vault = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
                uint256 lenderPrincipal = deadpool.lenderStakedTokensByTranche(lender, trancheId);
                rolledAssets += lenderPrincipal;
                vault.transferShares(lender, deadTrancheAddrs[trancheId], lenderPrincipal);
                deadpool.poolDisableRollOver(lender);
            }
        }
        deadpool.slashBorrowerBurden(rolledAssets);

        // ask deadpool to move platform token into this new contract
        IERC20 platoken = IERC20(lendingPool.platformTokenContractAddress());
        uint256 platokens = platoken.allowance(deadLendingPoolAddr, address(this));
        SafeERC20.safeTransferFrom(platoken, deadLendingPoolAddr, address(this), platokens);
    }
}
