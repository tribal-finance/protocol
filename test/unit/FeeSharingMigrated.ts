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
import { WAD } from "../helpers/conversion";

describe("FeeSharing", function () {

    let feeSharingContract: FeeSharing;
    let stakingContract: Staking;
    let assetContract: ERC20;
    let authorityContract: Authority;
    let wad: BigNumber;

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
        const { lendingPool, poolFactory, firstTrancheVault, staking, authority, feeSharing } = await loadFixture(duoPoolFixture);

        // Assuming the asset contract, staking, and authority are already deployed and available
        // Replace these with actual contract addresses or deployment logic
        assetContract = await ethers.getContractAt("ERC20", await firstTrancheVault.asset());
        stakingContract = await ethers.getContractAt("Staking", staking.address);
        authorityContract = await ethers.getContractAt("Authority", authority.address);

        wad = ethers.utils.parseEther("1");
        const beneficiaries = [staking.address, "OtherBeneficiaryAddress"];
        const shares = [wad.div(2), wad.div(2)]; // 50% each

        feeSharingContract = await ethers.getContractAt("FeeSharing", feeSharing.address);;
    });

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            expect(await feeSharingContract.assetContract()).to.equal(assetContract.address);
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
            ).to.be.revertedWith("AA:OA"); // Update the error message as per your contract's implementation
        });

        it("Should revert if array lengths of beneficiaries and shares do not match", async function () {
            const mismatchedBeneficiaries = [stakingContract.address];
            const mismatchedShares = [wad.div(2), wad.div(2)];

            await expect(
                feeSharingContract.connect(owner).updateBenificiariesAndShares(mismatchedBeneficiaries, mismatchedShares)
            ).to.be.revertedWith("beneficiaries and shares must have the same length"); // Update the error message as per your contract's implementation
        });

        it("Should revert if total shares do not sum up to 100%", async function () {
            const beneficiaries = [stakingContract.address, assetContract.address];
            const incorrectShares = [wad.div(3), wad.div(3)]; // Does not sum up to 100%

            await expect(
                feeSharingContract.connect(owner).updateBenificiariesAndShares(beneficiaries, incorrectShares)
            ).to.be.revertedWith("shares must sum to 100%"); // Update the error message as per your contract's implementation
        });

    });
});
