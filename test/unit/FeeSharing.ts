import { use, expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {deployMockContract} from '@ethereum-waffle/mock-contract';
import {waffleChai} from "@ethereum-waffle/chai";
import { BigNumber } from "ethers";

import ERC20 from '../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json';
import Authority from "../../artifacts/contracts/authority/Authority.sol/Authority.json"
import { MockProvider } from "ethereum-waffle";

async function deployFeeSharingStandaloneFixture() {

    const [owner, dev, stakingContract, otherBeneficiary] = await ethers.getSigners();

    const FeeSharing = await ethers.getContractFactory("FeeSharing");
    const feeSharing = await FeeSharing.deploy();

    const mockAuthority = await deployMockContract(owner, Authority.abi);

    const mockAssetContract = await deployMockContract(owner, ERC20.abi);

    const beneficiaries = [stakingContract.address, otherBeneficiary.address];

    const wad = await feeSharing.WAD();

    expect(wad).equals(ethers.utils.parseUnits("1", 18))

    const shares = [wad.div(2), wad.div(2)]; // 50% each for this example

    await feeSharing.initialize(mockAuthority.address, mockAssetContract.address, beneficiaries, shares);

    return {
        feeSharing, dev, beneficiaries, shares, wad, stakingContract, otherBeneficiary, mockAssetContract, owner, mockAuthority
    }
}

describe.only("FeeSharing", function () {

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            const {feeSharing, dev, beneficiaries, shares, mockAssetContract, mockAuthority} = await loadFixture(deployFeeSharingStandaloneFixture)

            expect(await feeSharing.assetContract()).to.equal(mockAssetContract.address);
            expect(await feeSharing.beneficiaries(0)).to.equal(beneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(beneficiaries[1]);
            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(shares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(shares[1]);
        });
    });

    describe("updateBenificiariesAndShares", function () {
        it("Should update beneficiaries and their shares", async function () {
            const {feeSharing, stakingContract, otherBeneficiary, mockAuthority, wad} = await loadFixture(deployFeeSharingStandaloneFixture)
            await mockAuthority.mock.isAdmin.returns(true)

            const newBeneficiaries: string[] = [otherBeneficiary.address, stakingContract.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary

            await feeSharing.updateBenificiariesAndShares(newBeneficiaries, newShares);
            
            expect(await feeSharing.beneficiaries(0)).to.equal(newBeneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(newBeneficiaries[1]);
            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(newShares[1]);
        });

        it("Should revert if it fails onlyOwnerOrAdmin check", async function () {
            const {feeSharing, stakingContract, otherBeneficiary, dev, wad, mockAuthority} = await loadFixture(deployFeeSharingStandaloneFixture)
            await mockAuthority.mock.isAdmin.returns(false)

            const newBeneficiaries: string[] = [stakingContract.address, otherBeneficiary.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary

            await expect(feeSharing.connect(dev).updateBenificiariesAndShares(newBeneficiaries, newShares)).to.be.revertedWith("AuthorityAware: caller is not the owner or admin");
        });

        it("Should revert if array length mismatch", async () => {
            const {feeSharing, stakingContract, mockAuthority, owner, wad} = await loadFixture(deployFeeSharingStandaloneFixture)
            
            const newBeneficiaries: string[] = [stakingContract.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; 

            await expect(feeSharing.connect(owner).updateBenificiariesAndShares(newBeneficiaries, newShares)).to.be.revertedWith("beneficiaries and shares must have the same length");
        })
    });

    describe("updateShares", function () {
        it("Should update beneficiaries shares correctly", async function () {
            const {feeSharing, owner, otherBeneficiary, dev, wad} = await loadFixture(deployFeeSharingStandaloneFixture)
            
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary
            await feeSharing.connect(owner).updateShares(newShares);

            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(newShares[1]);
        });

        it("Should revert if shares and beneficiaries length mismatch", async function () {
            const {feeSharing, owner, otherBeneficiary, dev, wad} = await loadFixture(deployFeeSharingStandaloneFixture)
            
            const newShares: BigNumber[] = [wad]; // Only one share is provided
            await expect(feeSharing.connect(owner).updateShares(newShares)).to.be.revertedWith("beneficiaries and shares must have the same length");
        });

        it("Should revert if sum of all shares != WAD", async () => {
            const {feeSharing, stakingContract, otherBeneficiary, owner, wad} = await loadFixture(deployFeeSharingStandaloneFixture)

            const newBeneficiaries: string[] = [stakingContract.address, otherBeneficiary.address, owner.address];
            const newShares: BigNumber[] = [wad.sub(ethers.utils.parseUnits(".75", 18)), BigNumber.from("0"), ethers.utils.parseUnits(".75", 18)]; // 25/0/75

            await feeSharing.connect(owner).updateBenificiariesAndShares(newBeneficiaries, newShares);
            
            expect(await feeSharing.beneficiaries(0)).to.equal(newBeneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(newBeneficiaries[1]);
            expect(await feeSharing.beneficiaries(2)).to.equal(newBeneficiaries[2]);

            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(newShares[1]);
            expect(await feeSharing.beneficiariesSharesWad(2)).to.equal(newShares[2]);

            // update to 33/33/33 expect failure to do a few (3) wei getting truncated
            const badShares: BigNumber[] = [wad.div(3), wad.div(3), wad.div(3)]
            await expect(feeSharing.connect(owner).updateShares(badShares)).to.be.rejectedWith("shares must sum to 100%");

        })
    });
});
