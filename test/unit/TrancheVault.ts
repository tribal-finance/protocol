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
import { WAD } from "../helpers/conversion";

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

        let { lendingPool, firstTrancheVault, secondTrancheVault } = await loadFixture(
            duoPoolFixture
        );
        trancheVault = firstTrancheVault
    });

    describe("State Variable Initialization", function () {

        let tranches: TrancheVault[];
        let lendingPool: LendingPool;
        let deployer: Signer;
        let borrower: Signer;
        let lenders: Signer[];

        beforeEach(async () => {
            const { lendingPool: _lendingPool, lenders: _lenders, deployer: _deployer, borrower: _borrower } = await loadFixture(duoPoolFixture);

            lendingPool = _lendingPool;
            deployer = _deployer;
            borrower = _borrower;
            lenders = _lenders;

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
            const trancheCount = await lendingPool.tranchesCount();
            console.log(DEFAULT_LENDING_POOL_PARAMS.minFundingCapacity);
            console.log(DEFAULT_LENDING_POOL_PARAMS.minFundingCapacity);
            console.log(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[0][1])
            console.log(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[1][1])

            function calculateTrancheCapacities(params: any, fundingSplitWads: any) {
                let trancheCapacities = [];

                for (let i = 0; i < params.tranchesCount; i++) {
                    let minCapacityForTranche = params.minFundingCapacity.mul(fundingSplitWads[i][1]).div(ethers.constants.WeiPerEther);
                    let maxCapacityForTranche = params.maxFundingCapacity.mul(fundingSplitWads[i][0]).div(ethers.constants.WeiPerEther);

                    // Swap if minCapacity is greater than maxCapacity
                    if (minCapacityForTranche.gt(maxCapacityForTranche)) {
                        [minCapacityForTranche, maxCapacityForTranche] = [maxCapacityForTranche, minCapacityForTranche];
                    }

                    trancheCapacities.push({
                        tranche: i,
                        minCapacity: minCapacityForTranche,
                        maxCapacity: maxCapacityForTranche
                    });
                }

                return trancheCapacities;
            }

            // Example usage
            const params = {
                minFundingCapacity: ethers.BigNumber.from("10000000000"), // Example total min capacity
                maxFundingCapacity: ethers.BigNumber.from("12000000000"), // Example total max capacity
                tranchesCount: 2 // Example tranche count
            };

            const fundingSplitWads = [
                [ethers.BigNumber.from("800000000000000000"), ethers.BigNumber.from("750000000000000000")], // Tranche 0 split ratios
                [ethers.BigNumber.from("200000000000000000"), ethers.BigNumber.from("250000000000000000")]  // Tranche 1 split ratios
            ];

            // Output the results
            console.log(calculateTrancheCapacities(params, fundingSplitWads));

            for (let i = 0; i < trancheCount; i++) {
                console.log("-----------Tranche", i, "------------------")
                console.log(await tranches[i].minFundingCapacity())
                console.log(await tranches[i].maxFundingCapacity())
            }
            expect(await tranches[0].minFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.minFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[0][1]).div(ethers.utils.parseEther("1")));
            expect(await tranches[1].minFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.minFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[1][1]).div(ethers.utils.parseEther("1")));
        });

        it("Should correctly get maxFundingCapacity", async function () {
            expect(await tranches[0].maxFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.maxFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[0][0]).div(ethers.utils.parseEther("1")));
            expect(await tranches[1].maxFundingCapacity()).equals(DEFAULT_LENDING_POOL_PARAMS.maxFundingCapacity.mul(DEFAULT_MULTITRANCHE_FUNDING_SPLIT[1][0]).div(ethers.utils.parseEther("1")));
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

        describe("Modifiers", function () {

            it("Should revert when non-owner or non-pool tries to deposit", async function () {
                await expect(tranches[0].connect(borrower).deposit(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("AA:L");
            });

            it("Should revert when non-owner or non-pool tries to withdraw", async function () {
                await expect(tranches[0].connect(borrower).withdraw(0, ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("AA:L");
            });

            it("Should revert when deposit is disabled", async function () {
                await tranches[0].disableDeposits();
                await expect(tranches[0].connect(lenders[0]).deposit(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("Vault: deposit disabled");
            });

            it("Should revert when withdraw is disabled", async function () {
                await tranches[0].disableWithdrawals();
                await expect(tranches[0].connect(lenders[0]).withdraw(0, ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("Vault: withdraw disabled");
            });

            it("Should revert when transfer is disabled/enabled", async function () {
                await tranches[0].disableTransfers();
                await expect(tranches[0].connect(lenders[0]).transfer(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("Vault: transfer disabled");
                await tranches[0].enableTransfers();
                await expect(tranches[0].connect(lenders[0]).transfer(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("Transfers are not implemented");
            });
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
