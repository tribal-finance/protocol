import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { PoolFactory, TrancheVault } from "../../typechain-types";
import { Signer, Contract } from "ethers";
import {
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

    describe.skip("State variables", function () {
        it("Should correctly get id", async function () {
            // assert id
        });

        it("Should correctly get poolAddress", async function () {
            // assert poolAddress
        });

        it("Should correctly get minFundingCapacity", async function () {
            // assert minFundingCapacity
        });

        it("Should correctly get maxFundingCapacity", async function () {
            // assert maxFundingCapacity
        });

        it("Should correctly get withdrawEnabled", async function () {
            // assert withdrawEnabled
        });

        it("Should correctly get depositEnabled", async function () {
            // assert depositEnabled
        });

        it("Should correctly get transferEnabled", async function () {
            // assert transferEnabled
        });
    });

    describe.skip("Initialization", function () {
        it("Should initialize correctly", async function () {
            // Call initialize function with correct arguments and assert
        });

        it("Should fail to initialize with incorrect arguments", async function () {
            // Call initialize function with incorrect arguments and assert failure
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
