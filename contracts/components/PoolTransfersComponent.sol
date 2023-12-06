// SPDX-License-Identifier: MIT

import "./Component.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";
import "../utils/Identifiers.sol";

pragma solidity 0.8.18;

contract PoolTransfersComponent is Component {
    
    function initialize(uint256 _instanceId, PoolStorage _poolStorage) public override initializer {
        _initialize(_instanceId, Identifiers.POOL_TRANSFERS_COMPONENT, _poolStorage);
    }

    function lenderEnableRollOver(
        address lender
    ) external {
       // PoolFactory poolFactory = PoolFactory(lendingPool.poolFactoryAddress());
        PoolFactory poolFactory = PoolFactory(poolStorage.getAddress(instanceId, "poolFactoryAddress"));
        LendingPool pool = LendingPool(poolStorage.getArrayAddress(instanceId, "lendingPoolInstances", instanceId));

        uint256 lockedPlatformTokens;
        uint256 trancheCount = poolStorage.getUint256(instanceId, "tranchesCount");
        for (uint8 trancheId; trancheId < trancheCount; trancheId++) {
            (uint256 staked, , , ) = pool.s_trancheRewardables(trancheId, lender);
            TrancheVault vault = TrancheVault(pool.trancheVaultAddresses(trancheId));
            (, uint256 locked, , ) = pool.s_trancheRewardables(trancheId, lender);
            lockedPlatformTokens += locked;
            vault.approveRollover(lender, staked);
        }


        // TODO FINISH MIGRATING ROLLOVERS USING NEW v2 COMPONENT SYSTEM

       // address[4] memory futureLenders = poolFactory.nextLenders();
      /* IERC20 platformTokenContractAddress = IERC20(poolStorage.getAddress(instanceId, "platformTokenContractAddress"));
        for (uint256 i = 0; i < futureLenders.length; i++) {
            SafeERC20.safeApprove(platformTokenContractAddress, futureLenders[i], 0);
            // approve transfer of platform tokens
            SafeERC20.safeApprove(
                platformTokenContractAddress,
                futureLenders[i],
                lockedPlatformTokens
            );

            IERC20 stableCoinContractAddress = IERC20(poolStorage.getAddress(instanceId, "stableCoinContractAddress"));

            SafeERC20.safeApprove(stableCoinContractAddress, futureLenders[i], 0);
            // approve transfer of the stablecoin contract
            SafeERC20.safeApprove(
                stableCoinContractAddress, // asume tranches.asset() == stablecoin address
                 futureLenders[i],
                2 ** 256 - 1 // infinity approve because we don't know how much interest will need to be accounted for
            );
        }*/
    }

    function executeRollover(uint256 deadInstanceId, uint256 lenderStartIndex, uint256 lenderEndIndex) external {
        // uint256 tranchesCount = lendingPool.tranchesCount();
        uint256 tranchesCount = poolStorage.getUint256(instanceId, "tranchesCount");
        require(tranchesCount == poolStorage.getUint256(deadInstanceId, "tranchesCount"), "tranche count mismatch");

        LendingPool deadpool = LendingPool(
            poolStorage.getArrayAddress(deadInstanceId, "lendingPoolInstances", deadInstanceId)
        );

        for (uint256 i = lenderStartIndex; i <= lenderEndIndex; i++) {
            // address lender = deadpool.lendersAt(i);
            address lender = poolStorage.getArrayAddress(deadInstanceId, "lenders", i);
            // Constants.RollOverSetting memory settings = LendingPool(deadLendingPoolAddr).lenderRollOverSettings(lender);
            Constants.RollOverSetting memory settings = abi.decode(
                poolStorage.getMappingAddressToBytes(deadInstanceId, "lenderRolloverSettings", lender),
                (Constants.RollOverSetting)
            );
            if (!settings.enabled) {
                continue;
            }

            for (uint8 trancheId; trancheId < tranchesCount; trancheId++) {
                //TrancheVault vault = TrancheVault(lendingPool.trancheVaultAddresses(trancheId));
                TrancheVault vault = TrancheVault(
                    poolStorage.getArrayAddress(instanceId, "trancheVaultAddresses", trancheId)
                );
                uint256 rewards = settings.rewards ? deadpool.lenderRewardsByTrancheRedeemable(lender, trancheId) : 0;
                // lenderRewardsByTrancheRedeemable will revert if the lender has previously withdrawn
                // transfer rewards from dead lender to dead tranche
                // SafeERC20.safeTransferFrom(
                //     IERC20(lendingPool.stableCoinContractAddress()),
                //     deadLendingPoolAddr,
                //     deadTrancheAddrs[trancheId],
                //     rewards
                // );

                TrancheVault deadVault = TrancheVault(
                    poolStorage.getArrayAddress(deadInstanceId, "trancheVaultAddresses", trancheId)
                );
                SafeERC20.safeTransferFrom(
                    IERC20(poolStorage.getAddress(instanceId, "stableCoinContractAddress")),
                    address(deadpool),
                    address(deadVault),
                    rewards
                );

                vault.rollover(lender, address(deadVault), rewards);
            }

            // ask deadpool to move platform token into this new contract
            // IERC20 platoken = IERC20(lendingPool.platformTokenContractAddress());
            IERC20 platoken = IERC20(poolStorage.getAddress(instanceId, "platformTokenContractAddress"));
            // uint256 platokens = platoken.allowance(deadLendingPoolAddr, address(this));
            uint256 platokens = platoken.allowance(address(deadpool), address(this));
            //SafeERC20.safeTransferFrom(platoken, deadLendingPoolAddr, address(this), platokens);
            SafeERC20.safeTransferFrom(platoken, address(deadpool), address(this), platokens);
        }
    }
}
