import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

import { BigNumber } from "ethers";
import setupUSDC, { USDC_PRECISION, USDC_ADDRESS_6 } from "../helpers/usdc";
import { Authority, ERC20, FeeSharing, LendingPool, PoolFactory, Staking, TrancheVault } from "../../typechain-types";
import { Signer, Contract } from "ethers";
import {
    DEFAULT_LENDING_POOL_PARAMS,
    DEFAULT_MULTITRANCHE_FUNDING_SPLIT,
    calculateTrancheCapacities,
    deployDuotranchePool,
    deployFactoryAndImplementations,
    deployUnitranchePool,
} from "../../lib/pool_deployments";
import STAGES from "../helpers/stages";
import { USDC, WAD } from "../helpers/conversion";
import { Sign } from "crypto";
import testSetup from "../helpers/usdc";

describe("FeeSharing", function () {

    let feeSharingContract: FeeSharing;
    let stakingContract: Staking;
    let assetContract: ERC20;
    let authorityContract: Authority;
    let wad: BigNumber;
    let foundationAddress: string;

    async function duoPoolFixture() {
        const [deployer, lender1, lender2, lender3, borrower, foundation] =
            await ethers.getSigners();
        const lenders = [lender1, lender2, lender3];

        foundationAddress = foundation.address;

        const poolFactory: PoolFactory = await deployFactoryAndImplementations(
            deployer,
            borrower,
            lenders,
            foundation.address
        );

        return await deployDuotranchePool(poolFactory, deployer, borrower, lenders);
    }

    before(async function () {
        const { lendingPool, poolFactory, firstTrancheVault, staking, authority, feeSharing } = await loadFixture(duoPoolFixture);

        // Assuming the asset contract, staking, and authority are already deployed and available
        // Replace these with actual contract addresses or deployment logic
        assetContract = await ethers.getContractAt("ERC20", await firstTrancheVault.asset());
        stakingContract = await ethers.getContractAt("Staking", staking.address);
        authorityContract = await ethers.getContractAt("Authority", authority.address);
        feeSharingContract = await ethers.getContractAt("FeeSharing", feeSharing.address);

        wad = ethers.utils.parseEther("1");
        const beneficiaries = [staking.address, "OtherBeneficiaryAddress"];
        const shares = [wad.div(2), wad.div(2)]; // 50% each

    });

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            const { staking } = await loadFixture(duoPoolFixture);

            // Expected beneficiaries and shares
            const expectedBeneficiaries = [staking.address, foundationAddress];
            const expectedShares = [
                ethers.utils.parseEther("0.2"), // 20% to staking
                ethers.utils.parseEther("0.8")  // 80% to foundation
            ];

            // Check each beneficiary and their share
            for (let i = 0; i < expectedBeneficiaries.length; i++) {
                expect(await feeSharingContract.beneficiaries(i)).to.equal(expectedBeneficiaries[i]);
                expect(await feeSharingContract.beneficiariesSharesWad(i)).to.equal(expectedShares[i]);
            }

            // Verify other state variables as necessary
            // Example: Checking if the authority contract address is set correctly
            expect(await feeSharingContract.authority()).to.equal(authorityContract.address);

        });
    });

    describe("updateBeneficiariesAndShares", function () {
        let owner: Signer, nonOwner: Signer;

        before(async function () {
            const accounts = await ethers.getSigners();
            owner = accounts[0];
            nonOwner = accounts[1];
        });


        it("Should update beneficiaries and their shares", async function () {
            // Use real contracts and beneficiaries
            const beneficiaries = [stakingContract.address, assetContract.address];
            const shares = [wad.div(2), wad.div(2)]; // 50% each

            await feeSharingContract.updateBenificiariesAndShares(beneficiaries, shares);

            expect(await feeSharingContract.beneficiaries(0)).to.equal(beneficiaries[0]);
            expect(await feeSharingContract.beneficiaries(1)).to.equal(beneficiaries[1]);
            expect(await feeSharingContract.beneficiariesSharesWad(0)).to.equal(shares[0]);
            expect(await feeSharingContract.beneficiariesSharesWad(1)).to.equal(shares[1]);
        });

        it("Should revert if called by a non-owner", async function () {
            const newBeneficiaries = [stakingContract.address, assetContract.address];
            const newShares = [wad.div(2), wad.div(2)];

            await expect(
                feeSharingContract.connect(nonOwner).updateBenificiariesAndShares(newBeneficiaries, newShares)
            ).to.be.revertedWith("AA:OA"); 
        });

        it("Should revert if array lengths of beneficiaries and shares do not match", async function () {
            const mismatchedBeneficiaries = [stakingContract.address];
            const mismatchedShares = [wad.div(2), wad.div(2)];

            await expect(
                feeSharingContract.connect(owner).updateBenificiariesAndShares(mismatchedBeneficiaries, mismatchedShares)
            ).to.be.revertedWith("beneficiaries and shares must have the same length"); 
        });

        it("Should revert if total shares do not sum up to 100%", async function () {
            const beneficiaries = [stakingContract.address, assetContract.address];
            const incorrectShares = [wad.div(3), wad.div(3)]; // Does not sum up to 100%

            await expect(
                feeSharingContract.connect(owner).updateBenificiariesAndShares(beneficiaries, incorrectShares)
            ).to.be.revertedWith("shares must sum to 100%"); // Update the error message as per your contract's implementation
        });



    });

    describe("updateShares", function () {
        let owner: Signer, nonOwner: Signer;

        before(async function () {
            const accounts = await ethers.getSigners();
            owner = accounts[0];
            nonOwner = accounts[1];
        });

        it("Should update beneficiaries shares correctly", async function () {
            const newShares = [
                ethers.utils.parseEther("0.3"), // 30%
                ethers.utils.parseEther("0.7"), // 70%
            ];

            await feeSharingContract.connect(owner).updateShares(newShares);

            expect(await feeSharingContract.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharingContract.beneficiariesSharesWad(1)).to.equal(newShares[1]);
        });

        it("Should revert if shares and beneficiaries length mismatch", async function () {
            const newShares = [ethers.utils.parseEther("1")]; // Only one share value

            await expect(
                feeSharingContract.connect(owner).updateShares(newShares)
            ).to.be.revertedWith("beneficiaries and shares must have the same length");
        });

        it("Should revert if total shares do not sum up to 100%", async function () {
            const incorrectShares = [
                ethers.utils.parseEther("0.6"), // 60%
                ethers.utils.parseEther("0.5"), // 50%, totals 110%
            ];

            await expect(
                feeSharingContract.connect(owner).updateShares(incorrectShares)
            ).to.be.revertedWith("shares must sum to 100%");
        });

        it("Should revert if sum of all shares != WAD", async () => {
            const newBeneficiaries = [stakingContract.address, foundationAddress, assetContract.address];
            const newShares = [
                ethers.utils.parseEther("0.25"), // 25%
                ethers.utils.parseEther("0"),    // 0%
                ethers.utils.parseEther("0.75")  // 75%
            ];

            // First, update the beneficiaries to match the new shares
            await feeSharingContract.connect(owner).updateBenificiariesAndShares(newBeneficiaries, newShares);

            // Now, attempt to update to an incorrect distribution of shares
            const badShares = [
                ethers.utils.parseEther("0.33"), // 33%
                ethers.utils.parseEther("0.33"), // 33%
                ethers.utils.parseEther("0.33")  // 33%, totals to 99%
            ];

            await expect(feeSharingContract.connect(owner).updateShares(badShares))
                .to.be.revertedWith("shares must sum to 100%"); // Replace with the actual revert message used in your contract
        });

        it("Should revert if called by a non-owner", async function () {
            const newShares = [
                ethers.utils.parseEther("0.5"),
                ethers.utils.parseEther("0.5"),
            ];

            await expect(
                feeSharingContract.connect(nonOwner).updateShares(newShares)
            ).to.be.revertedWith("AA:OA"); // Replace with your contract's specific revert message
        });

    });

    describe("distributeFees", function () {
        let owner: Signer;
        let balance: BigNumber;
        let shares: any;
    
        before(async function () {
            const accounts = await ethers.getSigners();
            owner = accounts[0];
            
            await testSetup();

            // Setup the balance for distribution
            
            balance = USDC(1000); // Example balance
            
            await assetContract.connect(owner).transfer(feeSharingContract.address, balance);
    
            // Define the shares for the beneficiaries
            shares = [
                ethers.utils.parseEther("0.2"), // 20% to the first beneficiary
                ethers.utils.parseEther("0.8"), // 80% to the second beneficiary
            ];
    
            // Setup the beneficiaries in the feeSharingContract
            const beneficiaries = [stakingContract.address, foundationAddress];
            await feeSharingContract.connect(owner).updateBenificiariesAndShares(beneficiaries, shares);
        });
        
        it("Should distribute fees correctly", async function () {
            await feeSharingContract.connect(owner).distributeFees();
    
            // Assert that the fees are distributed according to the shares
            const expectedDistribution = [
                balance.mul(shares[0]).div(wad),
                balance.mul(shares[1]).div(wad)
            ];
    
            // Check balances of beneficiaries after distribution
            const stakingBalance = await assetContract.balanceOf(stakingContract.address);
            const foundationBalance = await assetContract.balanceOf(foundationAddress);
    
            expect(stakingBalance).to.equal(expectedDistribution[0]);
            expect(foundationBalance).to.equal(expectedDistribution[1]);
    
            // Additional checks as necessary
            // For example, checking events emitted or other side effects of distributeFees
        });
    
        // Additional test cases as necessary
    });
    
});
