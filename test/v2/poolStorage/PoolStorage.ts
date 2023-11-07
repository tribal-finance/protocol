import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocol, labeledSigners } from "../utils/deployments";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADMIN, DEPLOYER, LENDER } from "../utils/constants";
import { PoolStorage, TribalGovernance } from "../../../typechain-types";


describe("PoolStorage", async () => {

    let governance: TribalGovernance;
    let poolStorage: PoolStorage;

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
        poolStorage = deployment.poolStorage;
    })

    it("check read write permissions for setBool", async () => {
        
    })

})