import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers, upgrades } from "hardhat";
import { Component, FeeSharing, PoolFactory, PoolStorage, PoolStorageTester, TribalGovernance } from "../../../typechain-types";
import { ADMIN, BORROWER, DEPLOYER, LENDER, POOL_STORAGE_READER, POOL_STORAGE_WRITER } from "./constants";
import { getNextAddresses } from "./helpers";

export const deployPoolStorageTester = async (
    deployer: SignerWithAddress
): Promise<PoolStorageTester> => {
    const PoolStorageTester = await ethers.getContractFactory("PoolStorageTester");
    const poolStorageTester = await PoolStorageTester.deploy();
    await poolStorageTester.deployed();

    return poolStorageTester;
}

export const deployTribalGovernance = async (
    deployer: SignerWithAddress,
    admin: SignerWithAddress,
    owner: SignerWithAddress,
    protocol: string[]
): Promise<TribalGovernance> => {
    const TribalGovernanceProxy = await upgrades.deployProxy(await ethers.getContractFactory("TribalGovernance", deployer), [admin.address, owner.address, protocol], { 'initializer': 'initialize', 'unsafeAllow': ['constructor'] });
    return await ethers.getContractAt("TribalGovernance", TribalGovernanceProxy.address);
}

export const deployPoolStorage = async (
    deployer: SignerWithAddress,
    governance: TribalGovernance
): Promise<PoolStorage> => {
    const PoolStorage = await ethers.getContractFactory("PoolStorage", deployer);
    const poolStorage = await PoolStorage.deploy(governance.address);
    await poolStorage.deployed();

    return poolStorage;
}

export const deployFeeSharing = async (
    deployer: SignerWithAddress,
    governance: string,
    stableCoinContractAddress: string,
    beneficiaries: string[],
    feeSplitWads: Number[]
): Promise<FeeSharing> => {
    const FeeSharing = await ethers.getContractFactory("FeeSharing");

    const params = [
        governance,
        stableCoinContractAddress,
        beneficiaries,
        feeSplitWads,
    ];
    const feeSharing = await upgrades.deployProxy(FeeSharing, params);
    await feeSharing.deployed();

    return await ethers.getContractAt("FeeSharing", feeSharing.address);
}

export const deployComponentBundle = async (
    deployer: SignerWithAddress,
): Promise<Component[]> => {
    const components: Component[] = [];

    const PoolCalculationsComponent = await ethers.getContractFactory("PoolCalculationsComponent", deployer);
    const poolCalculationsComponent = await PoolCalculationsComponent.deploy();
    await poolCalculationsComponent.deployed();

    const PoolTransfersComponent = await ethers.getContractFactory("PoolTransfersComponent", deployer);
    const poolTransfersComponent = await PoolTransfersComponent.deploy();
    await poolTransfersComponent.deployed();

    const PoolValidationComponent = await ethers.getContractFactory("PoolValidationComponent", deployer);
    const poolValidationComponent = await PoolValidationComponent.deploy();
    await poolValidationComponent.deployed();

    const PoolCoreComponent = await ethers.getContractFactory("PoolCoreComponent", deployer);
    const poolCoreComponent = await PoolCoreComponent.deploy();
    await poolCoreComponent.deployed();

    components.push(poolCalculationsComponent);
    components.push(poolTransfersComponent);
    components.push(poolValidationComponent);
    components.push(poolCoreComponent);

    return components;
}

export const deployPoolFactory = async (
    deployer: SignerWithAddress,
    governance: TribalGovernance,
    poolStorage: PoolStorage
): Promise<PoolFactory> => {

    const PoolFactory = await upgrades.deployProxy(
        await ethers.getContractFactory("PoolFactory", deployer),
        [governance.address, poolStorage.address],
        { 'initializer': 'initialize', 'unsafeAllow': ['constructor'] }
    );

    return await ethers.getContractAt("PoolFactory", PoolFactory.address);
}

export const labeledSigners = async (): Promise<{ deployer: SignerWithAddress, admin: SignerWithAddress, owner: SignerWithAddress, borrower: SignerWithAddress, lender1: SignerWithAddress, lender2: SignerWithAddress, lender3: SignerWithAddress, foundation: SignerWithAddress, signers: SignerWithAddress[] }> => {
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
    poolStorage: PoolStorage,
    poolFactory: PoolFactory,
    poolStorageTester: PoolStorageTester
}> => {

    const { deployer, admin, owner, borrower, lender1, lender2, lender3, foundation, signers } = await labeledSigners();

    const protocol = await getNextAddresses(deployer, 10);

    protocol.push(admin.address);

    const governance: TribalGovernance = await deployTribalGovernance(deployer, admin, owner, protocol);
    const poolStorage: PoolStorage = await deployPoolStorage(deployer, governance);
    const components: Component[] = await deployComponentBundle(deployer);
    const poolFactory: PoolFactory = await deployPoolFactory(deployer, governance, poolStorage);
    const poolStorageTester: PoolStorageTester = await deployPoolStorageTester(deployer);

    // TODO replace with mock deployment
    await poolFactory.connect(admin).setFeeSharingContractAddress(ethers.Wallet.createRandom().address);

    await poolFactory.connect(admin).setPoolComponents(components.map(c => c.address))
    await governance.connect(admin).grantRole(BORROWER, borrower.address);
    await poolStorageTester.setPoolStorage(poolStorage.address);

    // specific logic for making testing easier
    await governance.connect(admin).grantRole(POOL_STORAGE_READER, admin.address);
    await governance.connect(admin).grantRole(POOL_STORAGE_WRITER, admin.address);

    await governance.connect(admin).grantRole(POOL_STORAGE_READER, poolStorageTester.address);
    await governance.connect(admin).grantRole(POOL_STORAGE_WRITER, poolStorageTester.address);

    return {
        governance,
        poolStorage,
        poolFactory,
        poolStorageTester
    };
}