import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { LendingPool, PoolFactory, TrancheVault } from "../../typechain-types";
import { Signer, Contract } from "ethers";
import {
    DEFAULT_LENDING_POOL_PARAMS,
    DEFAULT_MULTITRANCHE_FUNDING_SPLIT,
    deployDuotranchePool,
    deployFactoryAndImplementations,
    deployUnitranchePool,
} from "../../lib/pool_deployments";
import STAGES from "../helpers/stages";

describe("TrancheVault contract", function () {
    let accounts;
    let trancheVault: Contract;
    let owner: Signer;
    let nonOwner: Signer;

    async function duoPoolFixture() {
        const [deployer, lender1, lender2, lender3, borrower, foundation] =
            await ethers.getSigners();
        const lenders = [lender1, lender2, lender3];

        const poolFactory: PoolFactory = await deployFactoryAndImplementations(
            deployer,
            borrower,
            lenders,
            foundation.address
        );

        return await deployDuotranchePool(poolFactory, deployer, borrower, lenders);
    }

    before(async function () {
        accounts = await ethers.getSigners();
        owner = accounts[0];
        nonOwner = accounts[1];

        let { lendingPool, firstTrancheVault } = await loadFixture(
            duoPoolFixture
        );

        trancheVault = firstTrancheVault

    });

    describe("State Variable Initialization", function () {

        let tranches: TrancheVault[];
        let lendingPool: LendingPool;

        beforeEach(async () => {
            const { lendingPool: _lendingPool } = await loadFixture(duoPoolFixture);

            lendingPool = _lendingPool;
            const trancheCount = await lendingPool.tranchesCount();

            tranches = []

            for (let i = 0; i < trancheCount; i++) {
                tranches.push(await ethers.getContractAt("TrancheVault", await lendingPool.trancheVaultAddresses(i)));
            }
        })

        it("Should correctly get id", async function () {
            expect(await tranches[0].id()).equals(0);
            expect(await tranches[1].id()).equals(1);
        });

        it("Should correctly get poolAddress", async function () {
            expect(await tranches[0].poolAddress()).equals(lendingPool.address);
            expect(await tranches[1].poolAddress()).equals(lendingPool.address);
        });

        it("Should correctly get minFundingCapacity", async function () {
            expect(await tranches[0].minFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.minFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[0]).div(ethers.utils.parseEther("1")));
            expect(await tranches[1].minFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.minFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[1]).div(ethers.utils.parseEther("1")));
        });

        it("Should correctly get maxFundingCapacity", async function () {
            expect(await tranches[0].maxFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.maxFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[0]).div(ethers.utils.parseEther("1")));
            expect(await tranches[1].maxFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.maxFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[1]).div(ethers.utils.parseEther("1")));

        });

        it("Should correctly get withdrawEnabled", async function () {
            expect(await tranches[0].withdrawEnabled()).equals(false);
            expect(await tranches[1].withdrawEnabled()).equals(false);
        });

        it("Should correctly get depositEnabled", async function () {
            expect(await tranches[0].depositEnabled()).equals(false);
            expect(await tranches[1].depositEnabled()).equals(false);
        });

        it("Should correctly get transferEnabled", async function () {
            expect(await tranches[0].transferEnabled()).equals(false);
            expect(await tranches[1].transferEnabled()).equals(false);
        });
    });

    describe.skip("Modifiers", function () {
        it("Should revert when non-owner or non-pool tries to deposit", async function () {
            // Call deposit function from non-owner and non-pool address and assert revert
        });

        it("Should revert when non-owner or non-pool tries to withdraw", async function () {
            // Call withdraw function from non-owner and non-pool address and assert revert
        });

        it("Should revert when deposit is disabled", async function () {
            // Disable deposit and then call deposit function and assert revert
        });

        it("Should revert when withdraw is disabled", async function () {
            // Disable withdraw and then call withdraw function and assert revert
        });

        it("Should revert when transfer is disabled", async function () {
            // Disable transfer and then call transfer function and assert revert
        });
    });

    describe.skip("Admin methods", function () {
        it("Should enable and disable deposits correctly", async function () {
            // Call enableDeposits and disableDeposits functions and assert depositEnabled state
        });

        it("Should enable and disable withdrawals correctly", async function () {
            // Call enableWithdrawals and disableWithdrawals functions and assert withdrawEnabled state
        });

        it("Should enable and disable transfers correctly", async function () {
            // Call enableTransfers and disableTransfers functions and assert transferEnabled state
        });
    });

    describe("setMaxFundingCapacity() function tests", () => {
        it("should fail to set the max funding capacity if the sender is not the owner", async () => {
            await expect(trancheVault.connect(nonOwner).setMaxFundingCapacity(2000)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("should successfully set the max funding capacity", async () => {
            const targetCapacity = 2000;
            let maxFundingCapacity = await trancheVault.maxFundingCapacity();
            expect(maxFundingCapacity).to.not.equal(targetCapacity);

            await trancheVault.connect(owner).setMaxFundingCapacity(2000);
            maxFundingCapacity = await trancheVault.maxFundingCapacity();
            expect(maxFundingCapacity).to.equal(2000);
        });
    });

    describe("pause() and unpause() function tests", () => {
        it("should fail to pause if the sender is not the owner or admin", async () => {
            await expect(trancheVault.connect(nonOwner).pause()).to.be.revertedWith("AA:OA");
        });

        it("should pause the contract successfully", async () => {
            let paused = await trancheVault.paused();
            expect(paused).to.equal(false);

            await trancheVault.connect(owner).pause();
            paused = await trancheVault.paused();
            expect(paused).to.equal(true);
        });

        it("should fail to unpause if the sender is not the owner or admin", async () => {
            await expect(trancheVault.connect(nonOwner).unpause()).to.be.revertedWith("AA:OA");
        });

        it("should unpause the contract successfully", async () => {
            let paused = await trancheVault.paused();
            expect(paused).to.equal(true);

            await trancheVault.connect(owner).unpause();
            paused = await trancheVault.paused();
            expect(paused).to.equal(false);
        });
    });
});
