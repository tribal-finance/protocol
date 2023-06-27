import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../../helpers/usdc";
import { DEFAULT_LENDING_POOL_PARAMS } from "../../../lib/pool_deployments";

import {
    ITestUSDC,
    LendingPool,
    PoolFactory,
    TrancheVault,
    TribalToken,
} from "../../../typechain-types";
import { USDC, WAD } from "../../helpers/conversion";
import {
    deployDuotranchePool,
    DeployedContractsType,
    deployFactoryAndImplementations,
    deployUnitranchePool,
    _getDeployedContracts,
    deployTribalToken,
} from "../../../lib/pool_deployments";
import testSetup from "../../helpers/usdc";
import STAGES from "../../helpers/stages";

describe("Full cycle sequential test", function () {

    async function generateRandomAddress() {
        const randomWallet = ethers.Wallet.createRandom();
        const [deployer] = await ethers.getSigners();
        const tx = await deployer.sendTransaction({
            to: randomWallet.address,
            value: ethers.utils.parseEther(".3")
        });
        await tx.wait();
        return randomWallet.connect(ethers.provider);
    }

    async function generateRandomAddresses(length: number) {
        const randomWallets = [];

        for (let i = 0; i < length; i++) {
            const randomWallet = await generateRandomAddress();
            randomWallets.push(randomWallet);
        }

        return randomWallets;
    }

    context("For unitranche pool", async function () {
        async function uniPoolFixture() {
            const { signers, usdc } = await testSetup();
            const [deployer, borrower, foundation] =
                signers;
            const lenders = await generateRandomAddresses(3);

            const tribalToken = await deployTribalToken(
                deployer,
                lenders,
                foundation.address
            );

            const poolFactory: PoolFactory = await deployFactoryAndImplementations(
                deployer,
                borrower,
                lenders,
                foundation.address
            );

            const afterDeploy = async (contracts: DeployedContractsType) => {
                return contracts;
            };

            const data = await deployUnitranchePool(
                poolFactory,
                deployer,
                borrower,
                lenders,
                {
                    platformTokenContractAddress: tribalToken.address,
                },
                afterDeploy
            );

            return {
                ...data,
                usdc,
                ...(await _getDeployedContracts(poolFactory)),
                tribalToken,
            };
        }

        /**
         * pool settings:
         * - lending term: 182.5 days ( 1/2 year )
         * - lender annual yield: 10%
         * - lender adjusted yield: 5%
         * - borrower annual interest rate: 15%
         * - borrower adjusted interest rate: 7.5%
         * - funds collected: $10,000
         * - lender 1 deposit: $8,000
         * - lender 2 deposit: $2,000
         */

        let usdc: ITestUSDC,
            tribalToken: TribalToken,
            lendingPool: LendingPool,
            firstTrancheVault: TrancheVault,
            poolFactory: PoolFactory,
            deployer: Signer,
            borrower: Signer,
            lenders: Signer[];

        before(async () => {
            const data = await loadFixture(uniPoolFixture);
            usdc = data.usdc;
            tribalToken = data.tribalToken;
            lendingPool = data.lendingPool;
            firstTrancheVault = data.firstTrancheVault;
            poolFactory = data.poolFactory;
            deployer = data.deployer;
            borrower = data.borrower;
            lenders = data.lenders;
        });

        it("is initially in INITIAL stage and requires a deposit of 2000 USDC", async () => {
            expect(await lendingPool.currentStage()).to.equal(STAGES.INITIAL);
            expect(await lendingPool.firstLossAssets()).to.equal(USDC(2000));
        });

        it("🏛️ 2000 USDC flc deposit from the borrower", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(2000));
            await lendingPool.connect(borrower).borrowerDepositFirstLossCapital();
        });

        it("transitions to the FLC_DEPOSITED stage", async () => {
            expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_DEPOSITED);
        });

        it("👮 receives adminOpenPool() from deployer", async () => {
            await lendingPool.connect(deployer).adminOpenPool();
        });

        it("transitions to OPEN stage", async () => {
            expect(await lendingPool.currentStage()).to.equal(STAGES.OPEN);
        });


        it("👛 8000 USDC deposit from all lenders", async () => {
            for (let i = 0; i < lenders.length; i++) {
                await usdc
                    .connect(lenders[i])
                    .approve(firstTrancheVault.address, USDC(8000));
                await firstTrancheVault
                    .connect(lenders[i])
                    .deposit(USDC(8000), await lenders[i].getAddress());
            }
        });

        it("In an ostentatious display of financial acumen, the all lenders manifests a predilection for the activation of rollovers", async () => {
            for (let i = 0; i < lenders.length; i++) {
                await lendingPool.connect(lenders[i]).lenderEnableRollOver(true, true, true);
            }
        })

        it("gives 8000 tranche vault tokens to lender 1", async () => {
            for (let i = 0; i < lenders.length; i++) {
                expect(
                    await firstTrancheVault.balanceOf(await lenders[i].getAddress())
                ).to.equal(USDC(8000));
            }
        });

        it("increases collectedAssets() to 8000", async () => {
            expect(await lendingPool.collectedAssets()).to.equal(USDC(8000));
        });

        it("sets lenderTotalExpectedRewardsByTranche for lender1 to 400 (8000* 1/2 year * 10%)", async () => {
            for (let i = 0; i < lenders.length; i++) {
                expect(
                    await lendingPool.lenderTotalExpectedRewardsByTranche(
                        await lenders[i].getAddress(),
                        0
                    )
                ).to.equal(USDC(400));
            }
        });

        it("sets borrowerExpectedInterest() to 750 USDC", async () => {
            expect(await lendingPool.borrowerExpectedInterest()).to.equal(USDC(750));
        });

        it("increases collectedAssets() to 10000", async () => {
            expect(await lendingPool.collectedAssets()).to.equal(USDC(10000));
        });

        it("👛 10000 TRIBAL tokens locked by lender1", async () => {
            for (let i = 0; i < lenders.length; i++) {

                await tribalToken
                    .connect(lenders[i])
                    .approve(lendingPool.address, WAD(10000));
                await lendingPool
                    .connect(lenders[i])
                    .lenderLockPlatformTokensByTranche(0, WAD(10000));
            }
        });

        it("sets lenderTotalExpectedRewardsByTranche for lender1 to 525 (3000 * 1/2 year * 10%) + (5000 * 1/2 year * 15%)", async () => {
            for (let i = 0; i < lenders.length; i++) {
                expect(
                    await lendingPool.lenderTotalExpectedRewardsByTranche(
                        await lenders[i].getAddress(),
                        0
                    )
                ).to.equal(USDC(525));
            }
        });

        it("sets allLendersInterest() to 625 USDC", async () => {
            expect(await lendingPool.allLendersInterest()).to.equal(USDC(625));
        });

        it("👮 gets adminTransitionToFundedState() call from deployer", () => {
            lendingPool.connect(deployer).adminTransitionToFundedState();
        });

        it("transitions to the FUNDED stage", async () => {
            expect(await lendingPool.currentStage()).to.equal(STAGES.FUNDED);
        });

        it("pool contract now holds 12000 USDC", async () => {
            expect(await usdc.balanceOf(lendingPool.address)).to.equal(USDC(12000));
        });

        it("🏛️ borrower withdraws principal and gets 10.000 USDC", async () => {
            const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
            await lendingPool.connect(borrower).borrow();
            const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
            expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
                USDC(10000)
            );
        });

        it("⏳ 30 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower pays $125 interest", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
            await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
        });

        it("⏳ 30 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower pays $125 interest", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
            await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
        });

        it("⏳ 30 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower pays $125 interest", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
            await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
        });

        it("⏳ 30 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower pays $125 interest", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
            await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
        });

        it("⏳ 30 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower pays $125 interest", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
            await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
        });

        it("⏳ 30 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower pays $125 interest", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(125));
            await lendingPool.connect(borrower).borrowerPayInterest(USDC(125));
        });

        it("borrowerOutstandingInterest() is now 0 (borrower already paid 750 USDC)", async () => {
            expect(await lendingPool.borrowerOutstandingInterest()).to.equal(0);
        });

        it("borrowerExcessSpread() is now 50 USDC (750(interest paid) - 625 (lenders interest) - 75(10% protocol fees))", async () => {
            expect(await lendingPool.borrowerExcessSpread()).to.equal(USDC(50));
        });

        it("⏳ 3 days pass by", async () => {
            // wait 30 days
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
            await ethers.provider.send("evm_mine", []);
        });

        it("🏛️ borrower repays 10000 USDC as principal", async () => {
            await usdc.connect(borrower).approve(lendingPool.address, USDC(10000));
            await lendingPool.connect(borrower).borrowerRepayPrincipal();
        });

        it("transitions to REPAID stage", async () => {
            expect(await lendingPool.currentStage()).to.equal(STAGES.REPAID);
        });

        it("🏛️ borrower withdraws FLC + excess spread (2050USDC)", async () => {
            const borrowerBalanceBefore = await usdc.balanceOf(borrower.getAddress());
            await lendingPool
                .connect(borrower)
                .borrowerWithdrawFirstLossCapitalAndExcessSpread();
            const borrowerBalanceAfter = await usdc.balanceOf(borrower.getAddress());
            expect(borrowerBalanceAfter.sub(borrowerBalanceBefore)).to.equal(
                USDC(2050)
            );
        });

        it("transitions to FLC_WITHDRAWN stage", async () => {
            expect(await lendingPool.currentStage()).to.equal(STAGES.FLC_WITHDRAWN);
        });

        describe("test out rolling over into next protocol", async () => {

            let nextLendingPool: LendingPool;
            let nextTrancheVault: TrancheVault;

            it("prepare next generation of protocol to roll into", async () => {
                const futureLenders = await poolFactory.nextLenders();
                const futureTranches = await poolFactory.nextTranches();

                const defaultParams = DEFAULT_LENDING_POOL_PARAMS;

                defaultParams.platformTokenContractAddress = await lendingPool.platformTokenContractAddress();
                defaultParams.stableCoinContractAddress = await lendingPool.stableCoinContractAddress();


                const lendingPoolParams = { ...defaultParams, borrowerAddress: await borrower.getAddress() };

                const nextPoolAddr = await poolFactory.callStatic.deployPool(lendingPoolParams, [WAD(1)]); // view only execution to check lender address
                await poolFactory.deployPool(lendingPoolParams, [WAD(1)]); // run the state change

                nextLendingPool = await ethers.getContractAt("LendingPool", nextPoolAddr);

                console.log(futureLenders);
                console.log(futureTranches);

                console.log("nextPoolAddr", nextPoolAddr)

                expect(nextPoolAddr).hexEqual(futureLenders[0]);

                console.log("tranche count", await nextLendingPool.tranchesCount());

                const nextTrancheAddr = await nextLendingPool.trancheVaultAddresses(0);

                console.log("nextTrancheAddr", nextTrancheAddr);

                expect(nextTrancheAddr).hexEqual(futureTranches[0]);

                nextTrancheVault = await ethers.getContractAt("TrancheVault", nextTrancheAddr);

            })

            it("is initially in INITIAL stage and requires a deposit of 2000 USDC", async () => {
                expect(await nextLendingPool.currentStage()).to.equal(STAGES.INITIAL);
                expect(await nextLendingPool.firstLossAssets()).to.equal(USDC(2000));
            });

            it("2000 USDC flc deposit from the borrower", async () => {
                await usdc.connect(borrower).approve(nextLendingPool.address, USDC(2000));
                await nextLendingPool.connect(borrower).borrowerDepositFirstLossCapital();
            });

            it("transitions to the FLC_DEPOSITED stage", async () => {
                expect(await nextLendingPool.currentStage()).to.equal(STAGES.FLC_DEPOSITED);
            });

            it("receives adminOpenPool() from deployer", async () => {
                await nextLendingPool.connect(deployer).adminOpenPool();
            });

            it("transitions to OPEN stage", async () => {
                expect(await nextLendingPool.currentStage()).to.equal(STAGES.OPEN);
            });

            it("perform rollover", async () => {
                const asset = await ethers.getContractAt("ERC20", await lendingPool.stableCoinContractAddress());

                const initialBalances = await Promise.all([
                    await asset.balanceOf(lendingPool.address),
                    await asset.balanceOf(firstTrancheVault.address),
                    await asset.balanceOf(nextLendingPool.address),
                    await asset.balanceOf(nextTrancheVault.address)
                ])
                await nextLendingPool.executeRollover(lendingPool.address, [firstTrancheVault.address], 0, 0);
                const finalBalances = await Promise.all([
                    await asset.balanceOf(lendingPool.address),
                    await asset.balanceOf(firstTrancheVault.address),
                    await asset.balanceOf(nextLendingPool.address),
                    await asset.balanceOf(nextTrancheVault.address)
                ])

                const deltaBalances = [
                    initialBalances[0].sub(finalBalances[0]),
                    initialBalances[1].sub(finalBalances[1]),
                    initialBalances[2].sub(finalBalances[2]),
                    initialBalances[3].sub(finalBalances[3]),
                ]

                expect(deltaBalances[0]).equals(initialBalances[0])
                expect(deltaBalances[1]).equals(initialBalances[1])
                expect(deltaBalances[2]).equals(0)
                expect(deltaBalances[3]).equals(-initialBalances[1].add(initialBalances[0]))
            })
        })
    });
});
