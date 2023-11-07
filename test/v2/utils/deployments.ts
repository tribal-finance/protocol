import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers, upgrades } from "hardhat";
import { TribalGovernance } from "../../../typechain-types";
import { ADMIN, BORROWER, DEPLOYER, LENDER } from "./constants";


export async function deployTribalGovernance(
    deployer: SignerWithAddress,
    owner: SignerWithAddress,
    foundation: SignerWithAddress
): Promise<TribalGovernance> {
    const TribalGovernanceProxy = await upgrades.deployProxy(await ethers.getContractFactory("TribalGovernance", deployer), [foundation.address, owner.address], { 'initializer': 'initialize', 'unsafeAllow': ['constructor'] });
    const governance = await ethers.getContractAt("TribalGovernance", TribalGovernanceProxy.address);
    return governance;
}

export const labeledSigners = async(): Promise<{deployer: SignerWithAddress, admin: SignerWithAddress, owner: SignerWithAddress, borrower: SignerWithAddress, lender1: SignerWithAddress, lender2: SignerWithAddress, lender3: SignerWithAddress, foundation: SignerWithAddress, signers: SignerWithAddress[]}> => {
    const [deployer, admin, owner, borrower, lender1, lender2, lender3, foundation, ...signers] = await ethers.getSigners();

    return {
        deployer,
        admin,
        owner,
        borrower,
        lender1,
        lender2,
        lender3,
        foundation,
        signers
    }
}

export const deployProtocol = async (): Promise<{governance: TribalGovernance}> => {

    const {deployer, admin, owner, borrower, lender1, lender2, lender3, foundation, signers} = await labeledSigners();

    const governance: TribalGovernance = await deployTribalGovernance(deployer, owner, foundation);

    return {
        governance
    };
}