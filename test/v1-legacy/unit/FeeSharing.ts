import { expect } from "chai";

import { ethers, upgrades, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumber } from "ethers";
import {MockProvider} from '@ethereum-waffle/provider';

import ERC20 from '../../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json'
import Authority from "../../artifacts/contracts/authority/Authority.sol/Authority.json"
import Staking from "../../../artifacts/contracts/staking/Staking.sol/Staking.json"
import FeeSharing  from "../../../artifacts/contracts/fee_sharing/FeeSharing.sol/FeeSharing.json";

const { deployContract, deployMockContract } = waffle;


async function deployFeeSharingStandaloneFixture(useWaffleProvider=false) {

    const [owner, dev, otherBeneficiary] = useWaffleProvider ? new MockProvider().getWallets() : await ethers.getSigners();

    
    const mockAuthority = await deployMockContract(owner, Authority.abi);
    const mockAssetContract = await deployMockContract(owner, ERC20.abi);
    const mockStakingContract = await deployMockContract(owner, Staking.abi);
    
    const beneficiaries = [mockStakingContract.address, otherBeneficiary.address];
    
    const wad = ethers.utils.parseEther("1");
    
    expect(wad).equals(ethers.utils.parseUnits("1", 18))
    
    const shares = [wad.div(2), wad.div(2)]; // 50% each for this example
    
    const feeSharing = await upgrades.deployProxy(await ethers.getContractFactory("FeeSharing"), 
    [mockAuthority.address, mockAssetContract.address, beneficiaries, shares],
    { 'initializer': 'initialize', 'unsafeAllow': ['constructor']});

    return {
        feeSharing, dev, beneficiaries, shares, wad, otherBeneficiary, mockAssetContract, owner, mockAuthority, mockStakingContract
    }
}

describe("FeeSharing", function () {

    describe("Initialization", function () {
        it("Should initialize correctly", async function () {
            const { feeSharing, dev, beneficiaries, shares, mockAssetContract, mockAuthority } = await loadFixture(deployFeeSharingStandaloneFixture)

            expect(await feeSharing.assetContract()).to.equal(mockAssetContract.address);
            expect(await feeSharing.beneficiaries(0)).to.equal(beneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(beneficiaries[1]);
            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(shares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(shares[1]);
        });
    });

    describe("updateBenificiariesAndShares", function () {
        it("Should update beneficiaries and their shares", async function () {
            const { feeSharing, mockStakingContract, otherBeneficiary, mockAuthority, wad } = await loadFixture(deployFeeSharingStandaloneFixture)
            await mockAuthority.mock.isAdmin.returns(true)

            const newBeneficiaries: string[] = [otherBeneficiary.address, mockStakingContract.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary

            await feeSharing.updateBenificiariesAndShares(newBeneficiaries, newShares);

            expect(await feeSharing.beneficiaries(0)).to.equal(newBeneficiaries[0]);
            expect(await feeSharing.beneficiaries(1)).to.equal(newBeneficiaries[1]);
            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(newShares[1]);
        });

        it("Should revert if it fails onlyOwnerOrAdmin check", async function () {
            const { feeSharing, mockStakingContract, otherBeneficiary, dev, wad, mockAuthority } = await loadFixture(deployFeeSharingStandaloneFixture)
            await mockAuthority.mock.isAdmin.returns(false)

            const newBeneficiaries: string[] = [mockStakingContract.address, otherBeneficiary.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary

            await expect(feeSharing.connect(dev).updateBenificiariesAndShares(newBeneficiaries, newShares)).to.be.revertedWith("AA:OA");
        });

        it("Should revert if array length mismatch", async () => {
            const { feeSharing, mockStakingContract, mockAuthority, owner, wad } = await loadFixture(deployFeeSharingStandaloneFixture)

            const newBeneficiaries: string[] = [mockStakingContract.address];
            const newShares: BigNumber[] = [wad, BigNumber.from("0")];

            await expect(feeSharing.connect(owner).updateBenificiariesAndShares(newBeneficiaries, newShares)).to.be.revertedWith("beneficiaries and shares must have the same length");
        })
    });

    describe("updateShares", function () {
        it("Should update beneficiaries shares correctly", async function () {
            const { feeSharing, owner, otherBeneficiary, dev, wad } = await loadFixture(deployFeeSharingStandaloneFixture)

            const newShares: BigNumber[] = [wad, BigNumber.from("0")]; // 100% to stakingContract, 0% to otherBeneficiary
            await feeSharing.connect(owner).updateShares(newShares);

            expect(await feeSharing.beneficiariesSharesWad(0)).to.equal(newShares[0]);
            expect(await feeSharing.beneficiariesSharesWad(1)).to.equal(newShares[1]);
        });

        it("Should revert if shares and beneficiaries length mismatch", async function () {
            const { feeSharing, owner, otherBeneficiary, dev, wad } = await loadFixture(deployFeeSharingStandaloneFixture)

            const newShares: BigNumber[] = [wad]; // Only one share is provided
            await expect(feeSharing.connect(owner).updateShares(newShares)).to.be.revertedWith("beneficiaries and shares must have the same length");
        });

        it("Should revert if sum of all shares != WAD", async () => {
            const { feeSharing, mockStakingContract, otherBeneficiary, owner, wad } = await loadFixture(deployFeeSharingStandaloneFixture)

            const newBeneficiaries: string[] = [mockStakingContract.address, otherBeneficiary.address, owner.address];
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
    describe("distributeFees", function () {
        it.skip("Should distribute fees correctly", async function () {
            const { feeSharing, beneficiaries, mockAssetContract, shares, owner, wad, mockStakingContract } =  await deployFeeSharingStandaloneFixture(true);
    
            const balance = ethers.utils.parseUnits("10000000", 18);
            await mockAssetContract.mock.balanceOf.returns(balance);
    
            const expectedDistribution = [
                balance.mul(await feeSharing.beneficiariesSharesWad(0)).div(wad),
                balance.mul(await feeSharing.beneficiariesSharesWad(1)).div(wad)
            ];
    
            // Mock the approve and transfer methods for all calls
            await mockAssetContract.mock.approve.returns(true);
            await mockAssetContract.mock.transfer.returns(true);
            await mockAssetContract.mock.allowance.returns(0);
    
            // Mock the staking contract
            await mockStakingContract.mock.addReward.returns();
    
            await feeSharing.distributeFees();

            // Check the 'approve' method was called with correct arguments
            expect('approve').to.be.calledOnContractWith(mockAssetContract, [beneficiaries[0], expectedDistribution[0]]);
            
            // Check the 'addReward' method was called with correct arguments
            expect('addReward').to.be.calledOnContractWith(mockStakingContract, [expectedDistribution[0]]);

    
            // Check the 'transfer' method was called with correct arguments for remaining beneficiaries
            for (let i = 1; i < beneficiaries.length; i++) {
                expect('transfer').to.be.calledOnContractWith(mockAssetContract, [beneficiaries[i], expectedDistribution[i]]);
            }
        });
    });

    describe("stakingContract", function () {
        it("Should return correct staking contract", async function () {
            const { feeSharing, mockStakingContract } = await loadFixture(deployFeeSharingStandaloneFixture);

            expect(await feeSharing.stakingContract()).to.equal(mockStakingContract.address);
        });
    });

});
