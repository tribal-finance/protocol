import { expect } from "chai";
import { ethers } from "hardhat";
import { TribalGovernance } from "../../../typechain-types";
import { deployProtocol, labeledSigners } from "../utils/deployments";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADMIN, DEPLOYER, LENDER } from "../utils/constants";


describe("TribalGovernance", async () => {

    let governance: TribalGovernance;

    let deployer: SignerWithAddress;
    let admin: SignerWithAddress;
    let foundation: SignerWithAddress;
    let lender1: SignerWithAddress;
    let lender2: SignerWithAddress;
    let lender3: SignerWithAddress;

    let borrower: SignerWithAddress;


    beforeEach(async () => {
        const deployment = await deployProtocol();
        const signers = await labeledSigners();

        deployer = signers.deployer;
        admin = signers.admin;
        foundation = signers.foundation
        lender1 = signers.lender1;
        lender2 = signers.lender2;
        lender3 = signers.lender3;

        governance = deployment.governance;
    })
    
    it("success - deployer has DEPLOYER role", async() => {
        expect(await governance.hasRole(DEPLOYER, deployer.address)).equals(true);
    });

    it("fail - foundation cannot set LENDER role", async() => {
        expect(await governance.hasRole(ADMIN, foundation.address)).equals(true);
        expect(await governance.hasRole(LENDER, lender1.address)).equals(false);
        await expect(governance.connect(foundation).grantRole(LENDER, lender1.address)).to.be.reverted;
        expect(await governance.hasRole(LENDER, lender1.address)).equals(false);
    });

    it("success - deployer does not have super user admin role", async () => {
        expect(await governance.hasRole(ethers.constants.HashZero, deployer.address)).equals(false);
    })
})