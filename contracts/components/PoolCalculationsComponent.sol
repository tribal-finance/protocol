// SPDX-License-Identifier: MIT

import "./Component.sol";

import "../vaults/TrancheVault.sol";
import "../storage/PoolStorage.sol";
import "../utils/Constants.sol";

pragma solidity 0.8.18;

contract PoolCalculationsComponent is Component {
    constructor(uint256 _instanceId, PoolStorage _poolStorage) Component(_instanceId, _poolStorage) {}

    function lenderEffectiveAprByTrancheWad(
        address lenderAddress,
        uint8 trancheId
    ) public view returns (uint) {
        // uint stakedAssets = lendingPool.lenderStakedTokensByTranche(lenderAddress, trancheId);
        bytes memory rawData = poolStorage.getMappingUint256AddressToBytes(instanceId, "lenderStakedTokensByTranche", trancheId, lenderAddress);
        Constants.Rewardable memory rewardData = abi.decode(rawData, (Constants.Rewardable));
        uint256 stakedAssets = rewardData.stakedAssets;
        //uint lockedPlatformTokens = lendingPool.lenderPlatformTokensByTrancheLocked(lenderAddress, trancheId);
        uint256 lockedPlatformTokens = rewardData.lockedPlatformTokens;

        // uint trancheBoostRatio = lendingPool.trancheBoostRatios(trancheId);
        uint256 trancheBoostRatio = poolStorage.getArrayUint256(instanceId, "trancheBoostRatios", trancheId);
        // uint trancheAPRWad = lendingPool.trancheAPRsWads(trancheId);
        uint256 trancheAPRWad = poolStorage.getArrayUint256(instanceId, "trancheAPRsWads", trancheId);

       //uint trancheBoostedAPRWad = lendingPool.trancheBoostedAPRsWads(trancheId);
        uint256 trancheBoostedAPRWad = poolStorage.getArrayUint256(instanceId, "trancheBoostedAPRsWads", trancheId);

        if (stakedAssets == 0) {
            return 0;
        }
        uint boostedAssets = lockedPlatformTokens / trancheBoostRatio;
        if (boostedAssets > stakedAssets) {
            boostedAssets = stakedAssets;
        }
        uint unBoostedAssets = stakedAssets - boostedAssets;
        uint weightedAverage = (unBoostedAssets * trancheAPRWad + boostedAssets * trancheBoostedAPRWad) / stakedAssets;
        return weightedAverage;
    }
}