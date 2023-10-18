import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { LendingPool } from "../../typechain-types";
import { Signer } from "ethers";
import STAGES, { STAGES_LOOKUP, STATE_MACHINE } from "./stages";

export const assertDefaultRatioWad = async(lendingPool: LendingPool) => {
    const stage = await lendingPool.currentStage();
    const trancheVaults = []
    const length = await lendingPool.tranchesCount();

    for(let i = 0; i < length; i++) {
        trancheVaults.push(await ethers.getContractAt("TrancheVault", await lendingPool.trancheVaultAddresses(i)))
    }

    const stablecoin = await ethers.getContractAt("ERC20", await lendingPool.stableCoinContractAddress());

    const availableAssets = await stablecoin.balanceOf(lendingPool.address);
    let trancheDefaultRatioWads = []
    for(let i = 0; i < length; i++) {
        const assetsToSend = (await lendingPool.trancheCoveragesWads(i)).mul(availableAssets).div(ethers.constants.WeiPerEther)
        let totalAssets = await trancheVaults[i].totalAssets();
        if(totalAssets.eq(ethers.BigNumber.from(0))) {
            totalAssets = ethers.BigNumber.from(1);
        }
        const trancheDefaultRatioWad = (assetsToSend.mul(ethers.utils.parseEther("1"))).div(totalAssets);
        trancheDefaultRatioWads.push(trancheDefaultRatioWad);
    }

    if(stage === STAGES.DEFAULTED) {
        for(let i = 0; i < length; i++) {
            if(i == 0) {
                expect(await trancheVaults[i].defaultRatioWad()).not.equals(0)
                expect(await trancheVaults[i].isDefaulted()).equals(true);
            } else {
                /**
                 * No Assets to Send: 
                 * If assetsToSend is 0, 
                 * it implies that there are no assets to be distributed to that tranche during default. 
                 * This can happen if the trancheCoveragesWads[i] value is zero (i.e., that tranche does not have any coverage). 
                 * In such a case, the default ratio is set to zero because the tranche isn't receiving any assets during default.
                 */
                // TL;DR, In multitranche scenaiors, 
                // the defaultRatio WAD will likely be zero if there isn't enough available assets to send after covering the first tranche.
                expect(await trancheVaults[i].defaultRatioWad()).equals(0)
                expect(await trancheVaults[i].isDefaulted()).equals(false);
            }
        }
    } else {
        for(let i = 0; i < length; i++) {
            expect(await trancheVaults[i].defaultRatioWad()).equals(0)
        }
    }
}

export const assertPoolViews = async (lendingPool: LendingPool, lender: Signer, failCase: number) => {

    const stage = await lendingPool.currentStage();

    // expect these buggy functions to fail at certain stages
    const badCases = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    if(!(failCase in badCases)) {
        await expect(lendingPool.allLendersInterest()).to.not.be.reverted;
        await expect(lendingPool.allLendersEffectiveAprWad()).to.not.be.reverted;
        await expect(lendingPool.borrowerExcessSpread()).to.not.be.reverted;
    }

    await expect(lendingPool.allLendersInterestByDate()).to.not.be.reverted;
    await expect(lendingPool.poolBalanceThreshold()).to.not.be.reverted;
    await expect(lendingPool.poolBalance()).to.not.be.reverted;
    await expect(lendingPool.borrowerPenaltyAmount()).to.not.be.reverted;
    await expect(lendingPool.borrowerExpectedInterest()).to.not.be.reverted;
    await expect(lendingPool.borrowerOutstandingInterest()).to.not.be.reverted;
    await expect(lendingPool.borrowerAdjustedInterestRateWad()).to.not.be.reverted;
    
    const lenderAddr = await lender.getAddress();
    await expect(lendingPool.lenderTotalAprWad(lenderAddr)).to.not.be.reverted;
    await expect(lendingPool.lenderAllDepositedAssets(lenderAddr)).to.not.be.reverted;

    const trancheCount = await lendingPool.tranchesCount();
    for(let i = 0; i < trancheCount; i++) {

        await expect(lendingPool.lenderDepositedAssetsByTranche(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderTotalExpectedRewardsByTranche(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderRewardsByTrancheGeneratedByDate(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderRewardsByTrancheRedeemed(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderEffectiveAprByTrancheWad(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderPlatformTokensByTrancheLocked(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderStakedTokensByTranche(lenderAddr, i)).to.not.be.reverted;
        await expect(lendingPool.lenderPlatformTokensByTrancheLockable(lenderAddr, i)).to.not.be.reverted;
    }
    
}