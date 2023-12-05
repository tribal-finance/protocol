import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocol, labeledSigners } from "../utils/deployments";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADMIN, DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT, DEPLOYER, LENDER } from "../utils/constants";
import { Component, PoolFactory, PoolStorage, TribalGovernance } from "../../../typechain-types";
import { getComponentBundleImplementation } from "../utils/helpers";
import exp from "constants";


describe("PoolFactory", async () => {

    let governance: TribalGovernance;
    let poolStorage: PoolStorage;
    let poolFactory: PoolFactory

    let deployer: SignerWithAddress;
    let admin: SignerWithAddress;
    let owner: SignerWithAddress;
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
        owner = signers.owner;
        foundation = signers.foundation
        lender1 = signers.lender1;
        lender2 = signers.lender2;
        lender3 = signers.lender3;

        governance = deployment.governance;
        poolStorage = deployment.poolStorage;
        poolFactory = deployment.poolFactory;
    })

    it("success - implementation bundle has been given real deployed implementations", async () => {
        const poolComponentBundleImpl = await poolFactory.getPoolComponents();
        expect(poolComponentBundleImpl.length).not.equals(0);
        for(let i = 0; i < poolComponentBundleImpl.length; i++) {
            expect(poolComponentBundleImpl[i]).not.equals(ethers.constants.AddressZero);
        }
    })

    it("success - implmentation values are null", async () => {
        const components: Component[] = await getComponentBundleImplementation(poolFactory);
        for(let i = 0; i < components.length; i++) {
            expect(await components[i].instanceId()).equals(0);
            expect(await components[i].poolStorage()).equals(ethers.constants.AddressZero);
        }
    })

    it("success - cloned values aren't null", async () => {
        const defaultParams = DEFAULT_LENDING_POOL_PARAMS;
        defaultParams.borrowerAddress = (await ethers.getSigners())[0].address
        defaultParams.stableCoinContractAddress = (await ethers.getSigners())[0].address
        defaultParams.platformTokenContractAddress = (await ethers.getSigners())[0].address

        expect(await poolFactory.bundleCount()).equals(0);

        await poolFactory.connect(owner).deployPool(DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT)
        await poolFactory.connect(owner).deployPool(DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT)

        expect(await poolFactory.bundleCount()).equals(2);

        const bundle = await poolFactory.getBundle(0);
        for(let i = 0; i < bundle.length; i++) {
            const component: Component = await ethers.getContractAt("Component", bundle[i]);
            expect(await component.instanceId()).not.equals(0);
            expect(await component.poolStorage()).not.equals(ethers.constants.AddressZero);
        }
    })
})