import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocol, labeledSigners } from "../utils/deployments";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADMIN, DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT, DEPLOYER, LENDER } from "../utils/constants";
import { Component, PoolFactory, PoolStorage, TribalGovernance } from "../../../typechain-types";
import { getComponentBundleImplementation } from "../utils/helpers";
import exp from "constants";

const {hexZeroPad, formatBytes32String} = ethers.utils;


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
        borrower = signers.borrower;

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
        defaultParams.borrowerAddress = borrower.address
        defaultParams.stableCoinContractAddress = ethers.Wallet.createRandom().address
        defaultParams.platformTokenContractAddress = ethers.Wallet.createRandom().address

        expect(await poolFactory.deploymentCounter()).equals(0);

        await poolFactory.connect(owner).deployPool(defaultParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT)
        await poolFactory.connect(owner).deployPool(defaultParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT)

        expect(await poolFactory.deploymentCounter()).equals(2);

        const deploymentCounter = await poolFactory.deploymentCounter();
        for(let i = 0; i < deploymentCounter.toNumber(); i++) {
            for(let j = 1; j < 5; j++) {
                const componentKey = hexZeroPad(`0x0${j}`, 32);
                const compAddr = await poolFactory.componentRegistry(i, componentKey);
                const component: Component = await ethers.getContractAt("Component", compAddr);
                expect(await component.identifer()).not.hexEqual("0x00")
                expect(await component.poolStorage()).not.equals(ethers.constants.AddressZero);
            }
        }
    })
})