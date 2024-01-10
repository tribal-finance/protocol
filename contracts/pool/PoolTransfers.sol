// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./LendingPool.sol";

import "../factory/PoolFactory.sol";
import "../vaults/TrancheVault.sol";

library PoolTransfers {
    event PlatformTokensReceivedFromDeadPool(address indexed lender, uint8 indexed trancheId, uint256 platformTokens);
    event WarningLenderHasNoPlatformTokensStaked(
        address indexed lender,
        uint8 indexed trancheId,
        uint256 platformTokens
    );

    function _transferAllPlatformTokensToNewPool(
        LendingPool deadPool,
        address lender,
        uint8 trancheId,
        LendingPool lendingPool
    ) internal {
        (, uint256 platformTokens, , ) = deadPool.s_trancheRewardables(trancheId, lender);
        if (platformTokens == 0) {
            emit WarningLenderHasNoPlatformTokensStaked(lender, trancheId, platformTokens);
        }

        // Transfer the platform tokens from the dead pool to the lending pool
        deadPool.decrementTotalLockedPlatformTokens(trancheId, platformTokens, lender);
        _receivePlatformTokensFromDeadPool(deadPool, lender, trancheId, platformTokens, lendingPool);

        // Transfer platform tokens to the lending pool contract
        IERC20 platformToken = IERC20(deadPool.platformTokenContractAddress());
        deadPool.transferToAdjacentPool(platformToken, platformTokens);
    }

    function _receivePlatformTokensFromDeadPool(
        LendingPool deadPool,
        address lender,
        uint8 trancheId,
        uint platformTokens,
        LendingPool lendingPool
    ) internal {
        require(msg.sender == address(deadPool), "Only dead pool can call");
        lendingPool.incrementTotalLockedPlatformTokens(trancheId, platformTokens, lender);
        emit PlatformTokensReceivedFromDeadPool(lender, trancheId, platformTokens);
    }

    // Remember to declare the event used in the function
    event PlatformTokensReceivedFromOldPool(address indexed lender, uint8 indexed trancheId, uint256 platformTokens);

    function executeRollover(
        LendingPool lendingPool,
        address deadLendingPoolAddr,
        address[] memory deadTrancheAddrs
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
        for (uint256 i = 0; i < deadpool.lenderCount(); i++) {
            address lender = deadpool.lendersAt(i);
            LendingPool.RollOverSetting memory settings = LendingPool(deadLendingPoolAddr).lenderRollOverSettings(
                lender
            );
            if (!settings.enabled) {
                continue;
            }

            if (settings.platformTokens) {
                // ask deadpool to move platform token into this new contract
                for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                    _transferAllPlatformTokensToNewPool(deadpool, lender, trancheId, lendingPool);
                }
            }

            if (settings.rewards) {
                // TODO: figure out how to roll interest
            }

            if (settings.principal) {
                for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                    TrancheVault vault = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
                    uint256 lenderPrincipal = deadpool.lenderStakedTokensByTranche(lender, trancheId);
                    rolledAssets += lenderPrincipal;
                    vault.transferShares(lender, deadTrancheAddrs[trancheId], lenderPrincipal);
                }
            }
            deadpool.poolDisableRollOver(lender);
        }
        deadpool.slashBorrowerBurden(rolledAssets);
    }
}
