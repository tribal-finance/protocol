import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { LendingPool } from "../../typechain-types";
import { Signer } from "ethers";
import STAGES from "./stages";


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