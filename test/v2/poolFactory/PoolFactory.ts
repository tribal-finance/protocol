import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocol, labeledSigners } from "../utils/deployments";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADMIN, DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT, DEPLOYER, LENDER } from "../utils/constants";
import { Component, PoolFactory, PoolStorage, TribalGovernance } from "../../../typechain-types";
import { getComponentBundleImplementation } from "../utils/helpers";
import exp from "constants";
import { factory } from "../../../typechain-types/contracts";

const { hexZeroPad, formatBytes32String } = ethers.utils;


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
        for (let i = 0; i < poolComponentBundleImpl.length; i++) {
            expect(poolComponentBundleImpl[i]).not.equals(ethers.constants.AddressZero);
        }
    })

    it("success - implmentation values are null", async () => {
        const components: Component[] = await getComponentBundleImplementation(poolFactory);
        for (let i = 0; i < components.length; i++) {
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
        for (let i = 0; i < deploymentCounter.toNumber(); i++) {
            const instanceId = await poolFactory.instanceIds(i);
            for (let j = 1; j < 5; j++) {
                const componentKey = hexZeroPad(`0x0${j}`, 32);
                const compAddr = await poolFactory.componentRegistry(instanceId, componentKey);
                const component: Component = await ethers.getContractAt("Component", compAddr);
                expect(await component.identifer()).not.hexEqual("0x00")
                expect(await component.poolStorage()).not.equals(ethers.constants.AddressZero);
            }
        }
    })

    it.only("success - values are initialized correctly after deployment", async () => {
        const defaultParams = DEFAULT_LENDING_POOL_PARAMS;
        defaultParams.borrowerAddress = borrower.address;
        defaultParams.stableCoinContractAddress = ethers.Wallet.createRandom().address;
        defaultParams.platformTokenContractAddress = ethers.Wallet.createRandom().address;

        let instanceId: any = 0;

        expect(await poolStorage.getString(instanceId, "name")).equals("");
        expect(await poolStorage.getString(instanceId, "token")).equals("");
        expect(await poolStorage.getAddress(instanceId, "stableCoinContractAddress")).equals(ethers.constants.AddressZero);
        expect(await poolStorage.getAddress(instanceId, "platformTokenContractAddress")).equals(ethers.constants.AddressZero);
        expect(await poolStorage.getAddress(instanceId, "borrowerAddress")).equals(ethers.constants.AddressZero);
        expect(await poolStorage.getUint256(instanceId, "minFundingCapacity")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "maxFundingCapacity")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "fundingPeriodSeconds")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "lendingTermSeconds")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "firstLossAssets")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "borrowerTotalInterestRateWad")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "repaymentRecurrenceDays")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "gracePeriodDays")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "protocolFeeWad")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "defaultPenalty")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "penaltyRateWad")).equals(0);
        expect(await poolStorage.getUint256(instanceId, "tranchesCount")).equals(0);

        for(let i = 0; i < defaultParams.tranchesCount; i++) {
            expect(await poolStorage.getArrayUint256(instanceId, "trancheAPRsWads", i)).equals(0);
            expect(await poolStorage.getArrayUint256(instanceId, "trancheBoostedAPRsWads", i)).equals(0);
            expect(await poolStorage.getArrayUint256(instanceId, "trancheBoostRatios", i)).equals(0);
            expect(await poolStorage.getArrayUint256(instanceId, "trancheCoveragesWads", i)).equals(0);
        }

        // Deploy the pool using the factory
        await poolFactory.connect(owner).deployPool(defaultParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT);

        instanceId = await poolFactory.instanceIds(0);

        expect(await poolStorage.getString(instanceId, "name")).equals(defaultParams.name);
        expect(await poolStorage.getString(instanceId, "token")).equals(defaultParams.token);
        expect(await poolStorage.getAddress(instanceId, "stableCoinContractAddress")).equals(defaultParams.stableCoinContractAddress);
        expect(await poolStorage.getAddress(instanceId, "platformTokenContractAddress")).equals(defaultParams.platformTokenContractAddress);
        expect(await poolStorage.getAddress(instanceId, "borrowerAddress")).equals(defaultParams.borrowerAddress);
        expect(await poolStorage.getUint256(instanceId, "minFundingCapacity")).equals(defaultParams.minFundingCapacity);
        expect(await poolStorage.getUint256(instanceId, "maxFundingCapacity")).equals(defaultParams.maxFundingCapacity);
        expect(await poolStorage.getUint256(instanceId, "fundingPeriodSeconds")).equals(defaultParams.fundingPeriodSeconds);
        expect(await poolStorage.getUint256(instanceId, "lendingTermSeconds")).equals(defaultParams.lendingTermSeconds);
        expect(await poolStorage.getUint256(instanceId, "firstLossAssets")).equals(defaultParams.firstLossAssets);
        expect(await poolStorage.getUint256(instanceId, "borrowerTotalInterestRateWad")).equals(defaultParams.borrowerTotalInterestRateWad);
        expect(await poolStorage.getUint256(instanceId, "repaymentRecurrenceDays")).equals(defaultParams.repaymentRecurrenceDays);
        expect(await poolStorage.getUint256(instanceId, "gracePeriodDays")).equals(defaultParams.gracePeriodDays);
        expect(await poolStorage.getUint256(instanceId, "protocolFeeWad")).equals(defaultParams.protocolFeeWad);
        expect(await poolStorage.getUint256(instanceId, "defaultPenalty")).equals(defaultParams.defaultPenalty);
        expect(await poolStorage.getUint256(instanceId, "penaltyRateWad")).equals(defaultParams.penaltyRateWad);
        expect(await poolStorage.getUint256(instanceId, "tranchesCount")).equals(defaultParams.tranchesCount);

        for(let i = 0; i < defaultParams.tranchesCount; i++) {
            expect(await poolStorage.getArrayUint256(instanceId, "trancheAPRsWads", i)).equals(defaultParams.trancheAPRsWads[i]);
            expect(await poolStorage.getArrayUint256(instanceId, "trancheBoostedAPRsWads", i)).equals(defaultParams.trancheBoostedAPRsWads[i]);
            expect(await poolStorage.getArrayUint256(instanceId, "trancheBoostRatios", i)).equals(defaultParams.trancheBoostRatios[i]);
            expect(await poolStorage.getArrayUint256(instanceId, "trancheCoveragesWads", i)).equals(defaultParams.trancheCoveragesWads[i]);
        }
    });

})