import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers, upgrades } from "hardhat";
import { PoolStorage, TribalGovernance } from "../../../typechain-types";
import { ADMIN, BORROWER, DEPLOYER, LENDER } from "./constants";


export const deployTribalGovernance = async(
    deployer: SignerWithAddress,
    owner: SignerWithAddress,
    foundation: SignerWithAddress
): Promise<TribalGovernance> => {
    const TribalGovernanceProxy = await upgrades.deployProxy(await ethers.getContractFactory("TribalGovernance", deployer), [foundation.address, owner.address], { 'initializer': 'initialize', 'unsafeAllow': ['constructor'] });
    const governance = await ethers.getContractAt("TribalGovernance", TribalGovernanceProxy.address);
    return governance;
}

export const deployPoolStorage = async(
    deployer: SignerWithAddress,
    governance: TribalGovernance
): Promise<PoolStorage> => {
    const PoolStorage = await ethers.getContractFactory("PoolStorage");
    const poolStorage = await PoolStorage.deploy(governance.address);
    await poolStorage.deployed();

    return poolStorage;
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

export const deployProtocol = async (): Promise<{
    governance: TribalGovernance
    poolStorage: PoolStorage
}> => {

    const {deployer, admin, owner, borrower, lender1, lender2, lender3, foundation, signers} = await labeledSigners();

    const governance: TribalGovernance = await deployTribalGovernance(deployer, owner, foundation);
    const poolStorage: PoolStorage = await deployPoolStorage(deployer, governance);

    return {
        governance,
        poolStorage
    };
}