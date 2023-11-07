import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers, upgrades } from "hardhat";
import { Component, PoolStorage, TribalGovernance } from "../../../typechain-types";
import { ADMIN, BORROWER, DEPLOYER, LENDER } from "./constants";
import { Sign } from "crypto";


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
    const PoolStorage = await ethers.getContractFactory("PoolStorage", deployer);
    const poolStorage = await PoolStorage.deploy(governance.address);
    await poolStorage.deployed();

    return poolStorage;
}

export const deployComponentBundle = async (
    deployer: SignerWithAddress,
): Promise<Component[]> => {
    const components: Component[] = [];

    const PoolCalculationsComponent = await ethers.getContractFactory("PoolCalculationsComponent", deployer);
    const poolCalculationsComponent = await PoolCalculationsComponent.deploy(0, ethers.constants.AddressZero);
    await poolCalculationsComponent.deployed();

    const PoolTransfersComponent = await ethers.getContractFactory("PoolTransfersComponent", deployer);
    const poolTransfersComponent = await PoolTransfersComponent.deploy(0, ethers.constants.AddressZero);
    await poolTransfersComponent.deployed();

    const PoolValidationComponent = await ethers.getContractFactory("PoolValidationComponent", deployer);
    const poolValidationComponent = await PoolValidationComponent.deploy(0, ethers.constants.AddressZero);
    await poolValidationComponent.deployed();

    components.push(poolCalculationsComponent);
    components.push(poolTransfersComponent);
    components.push(poolValidationComponent);

    return components;
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
    const components: Component[] = await deployComponentBundle(deployer);

    return {
        governance,
        poolStorage
    };
}