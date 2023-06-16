import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


async function deployFeeSharingStandaloneFixture() {

    const [owner, dev, stakingContract, otherBeneficiary, assetContract] = await ethers.getSigners();

    const FeeSharing = await ethers.getContractFactory("FeeSharing");
    const feeSharing = await FeeSharing.deploy();
    const AuthorityFactory = await ethers.getContractFactory("Authority");
    const authority = await AuthorityFactory.deploy();
    await authority.deployed();
    await authority.initialize();
    await authority.connect(owner).addAdmin(await owner.getAddress());


    const beneficiaries = [stakingContract.address, otherBeneficiary.address];

    const wad = await feeSharing.WAD();

    expect(wad).equals(ethers.utils.parseUnits("1", 18))
    expect(await authority.isAdmin(dev.address)).equals(false);
    expect(await authority.owner()).to.not.hexEqual(dev.address)

    const shares = [wad.div(2), wad.div(2)]; // 50% each for this example

    await feeSharing.initialize(authority.address, assetContract.address, beneficiaries, shares);

    return {
        feeSharing, dev, beneficiaries, shares, wad, stakingContract, otherBeneficiary, assetContract, owner
    }
}

describe("FeeSharing", function () {

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            const {feeSharing, dev, beneficiaries, shares, assetContract} = await loadFixture(deployFeeSharingStandaloneFixture)

            expect(await feeSharing.assetContract()).to.equal(assetContract.address);
            expect(await feeSharing.beneficiaries(0)).to.equal(beneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(beneficiaries[1]);
            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(shares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(shares[1]);
        });
    });

    describe("updateBenificiariesAndShares", function () {
        it("Should update beneficiaries and their shares", async function () {
            const {feeSharing, stakingContract, otherBeneficiary, owner, wad} = await loadFixture(deployFeeSharingStandaloneFixture)

            const newBeneficiaries: string[] = [stakingContract.address, otherBeneficiary.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary

            await feeSharing.connect(owner).updateBenificiariesAndShares(newBeneficiaries, newShares);
            
            expect(await feeSharing.beneficiaries(0)).to.equal(newBeneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(newBeneficiaries[1]);
            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(newShares[1]);
        });

        it("Should revert if called by non-owner", async function () {
            const {feeSharing, stakingContract, otherBeneficiary, dev, wad} = await loadFixture(deployFeeSharingStandaloneFixture)
            
            const newBeneficiaries: string[] = [stakingContract.address, otherBeneficiary.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary

            await expect(feeSharing.connect(dev).updateBenificiariesAndShares(newBeneficiaries, newShares)).to.be.revertedWith("AuthorityAware: caller is not the owner or admin");
        });
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
    });
});
