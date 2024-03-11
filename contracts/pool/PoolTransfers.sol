// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./LendingPool.sol";
import "../factory/PoolFactory.sol";
import "../vaults/TrancheVault.sol";

library PoolTransfers {
    error VaultFundingFailed(address vault, uint256 fundingAmount, uint256 expectedMinimumAmount, uint256 trancheId);

    event PlatformTokensReceivedFromDeadPool(address indexed lender, uint8 indexed trancheId, uint256 platformTokens);
    event WarningLenderHasNoPlatformTokensStaked(
        address indexed lender,
        uint8 indexed trancheId,
        uint256 platformTokens
    );

    // handle transfer of appropriate number of platform tokens from deadpool to new pool
    function _transferPlatformTokensToNewPool(
        LendingPool deadPool,
        address lender,
        uint8 trancheId,
        LendingPool lendingPool,
        uint256 platformTokens
    ) internal {
        (, uint256 totalPlatformTokens, , ) = deadPool.s_trancheRewardables(trancheId, lender);
        require(platformTokens <= totalPlatformTokens, "platform tokens exceed total");

        // Is warning necessary?
        if (platformTokens == 0) {
            emit WarningLenderHasNoPlatformTokensStaked(lender, trancheId, platformTokens);
        }

        // Transfer the platform tokens from the dead pool to the lending pool
        deadPool.decrementTotalLockedPlatformTokens(trancheId, platformTokens, lender);
        _receivePlatformTokensFromDeadPool(lender, trancheId, platformTokens, lendingPool);

        // Transfer platform tokens to the lending pool contract
        IERC20 platformToken = IERC20(deadPool.platformTokenContractAddress());
        deadPool.transferToAdjacentPool(platformToken, platformTokens);
    }

    function _receivePlatformTokensFromDeadPool(
        address lender,
        uint8 trancheId,
        uint platformTokens,
        LendingPool lendingPool
    ) internal {
        lendingPool.incrementTotalLockedPlatformTokens(trancheId, platformTokens, lender);
        emit PlatformTokensReceivedFromDeadPool(lender, trancheId, platformTokens);
    }

    // Remember to declare the event used in the function
    event PlatformTokensReceivedFromOldPool(address indexed lender, uint8 indexed trancheId, uint256 platformTokens);

    // need to clarify the logic here
    // Only the principal
    function executeRollover(
        LendingPool lendingPool,
        address deadLendingPoolAddr,
        address[] memory deadTrancheAddrs
    ) external {
        uint256 tranchesCount = lendingPool.tranchesCount();
        LendingPool deadpool = LendingPool(deadLendingPoolAddr);
        require(deadpool.currentStage() == LendingPool.Stages.BORROWED, "must be in borrowed stage");
        require(deadpool.borrowerOutstandingInterest() == 0, "all interest must be repaid");
        require(lendingPool.borrowerAddress() == deadpool.borrowerAddress(), "borrowers must match");
        require(tranchesCount == deadTrancheAddrs.length, "tranche array mismatch");

        uint256 rolledAssets = 0;

        for (uint256 i = 0; i < deadpool.lenderCount(); i++) {
            address lender = deadpool.lendersAt(i);
            LendingPool.RollOverSetting memory settings = LendingPool(deadLendingPoolAddr).lenderRollOverSettings(
                lender
            );
            if (!settings.enabled) {
                continue;
            }

            if (settings.rewards) {}

            if (settings.principal) {
                for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                    TrancheVault vault0 = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
                    uint256 lenderPrincipal = deadpool.lenderStakedTokensByTranche(lender, trancheId);
                    uint256 lenderRollOver = lenderPrincipal;

                    // only roll the lender if their deposit won't let them go over maxFundingCapacity
                    // FIXME: I thought that as much of the lender's principal as possible should be rolled over and the rest returned to the lender
                    uint256 vaultMax = vault0.maxFundingCapacity();
                    if (lenderPrincipal + vault0.totalAssets() > vaultMax) {
                        // transfer the difference back to the lender
                        uint256 excess = lenderPrincipal + vault0.totalAssets() - vaultMax;
                        lenderRollOver -= excess;
                    }
                    rolledAssets += lenderRollOver;
                    vault0.transferShares(lender, deadTrancheAddrs[trancheId], lenderRollOver);
                    if (settings.platformTokens) {
                        // ask deadpool to move platform token into this new contract
                        for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                            // FIXME: transfer appropriate amount of platform tokens to the new pool
                            // _transferPlatformTokensToNewPool(deadPool, lender, trancheId, lendingPool);
                            uint256 platformTokens = deadpool.lenderStakedTokensByTranche(lender, trancheId);
                            uint256 rolloverPlatformTokens = (platformTokens * lenderPrincipal) / lenderRollOver;
                            _transferPlatformTokensToNewPool(
                                deadpool,
                                lender,
                                trancheId,
                                lendingPool,
                                rolloverPlatformTokens
                            );
                        }
                    }
                }
            }

            deadpool.poolDisableRollOver(lender);
        }

        for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
            TrancheVault vault0 = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
            uint256 vaultMin = vault0.minFundingCapacity();
            if (vault0.totalAssets() < vaultMin) {
                revert VaultFundingFailed(address(vault0), vault0.totalAssets(), vaultMin, trancheId);
            }
        }

        deadpool.slashBorrowerBurden(rolledAssets);
    }
}
