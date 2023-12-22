import { expect } from "chai";
import { ethers } from "hardhat";
import { deployProtocol, labeledSigners } from "../utils/deployments";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ADMIN, DEFAULT_LENDING_POOL_PARAMS, DEFAULT_MULTITRANCHE_FUNDING_SPLIT, DEPLOYER, LENDER } from "../utils/constants";
import { Component, PoolFactory, PoolStorage, PoolStorageTester, TribalGovernance } from "../../../typechain-types";
import { getComponentBundleImplementation } from "../utils/helpers";
import exp from "constants";
import { factory } from "../../../typechain-types/contracts";

const { hexZeroPad, formatBytes32String } = ethers.utils;


describe("PoolFactory", async () => {

    let governance: TribalGovernance;
    let poolStorage: PoolStorage;
    let poolFactory: PoolFactory

    let poolStorageTester: PoolStorageTester;

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
        poolStorageTester = deployment.poolStorageTester;
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

    it("success - values are initialized correctly after deployment", async () => {
        const defaultParams = DEFAULT_LENDING_POOL_PARAMS;
        defaultParams.borrowerAddress = borrower.address;
        defaultParams.stableCoinContractAddress = ethers.Wallet.createRandom().address;
        defaultParams.platformTokenContractAddress = ethers.Wallet.createRandom().address;

        let instanceId: any = 0;

        expect(ethers.utils.defaultAbiCoder.decode(["string"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getString", ["name"])))).to.deep.equal([""]);
        expect(ethers.utils.defaultAbiCoder.decode(["string"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getString", ["token"])))).to.deep.equal([""]);
        expect(ethers.utils.defaultAbiCoder.decode(["address"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getAddress", ["stableCoinContractAddress"])))).to.deep.equal([ethers.constants.AddressZero]);
        expect(ethers.utils.defaultAbiCoder.decode(["address"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getAddress", ["platformTokenContractAddress"])))).to.deep.equal([ethers.constants.AddressZero]);
        expect(ethers.utils.defaultAbiCoder.decode(["address"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getAddress", ["borrowerAddress"])))).to.deep.equal([ethers.constants.AddressZero]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["minFundingCapacity"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["maxFundingCapacity"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["fundingPeriodSeconds"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["lendingTermSeconds"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["firstLossAssets"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["borrowerTotalInterestRateWad"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["repaymentRecurrenceDays"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["gracePeriodDays"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["protocolFeeWad"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["penaltyRateWad"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["defaultPenalty"])))).to.deep.equal([0]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["tranchesCount"])))).to.deep.equal([0]);

        for(let i = 0; i < defaultParams.tranchesCount; i++) {
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheAPRsWads", i])))).to.deep.equal([0]);
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheBoostedAPRsWads", i])))).to.deep.equal([0]);
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheBoostRatios", i])))).to.deep.equal([0]);
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheCoveragesWads", i])))).to.deep.equal([0]);

        }
        
        // Deploy the pool using the factory
        await poolFactory.connect(owner).deployPool(defaultParams, DEFAULT_MULTITRANCHE_FUNDING_SPLIT);
        instanceId = await poolFactory.instanceIds(0);
        await poolStorageTester.setInstanceId(instanceId);

        expect(ethers.utils.defaultAbiCoder.decode(["string"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getString", ["name"])))).to.deep.equal([defaultParams.name]);
        expect(ethers.utils.defaultAbiCoder.decode(["string"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getString", ["token"])))).to.deep.equal([defaultParams.token]);
        expect(ethers.utils.defaultAbiCoder.decode(["address"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getAddress", ["stableCoinContractAddress"])))).to.deep.equal([defaultParams.stableCoinContractAddress]);
        expect(ethers.utils.defaultAbiCoder.decode(["address"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getAddress", ["platformTokenContractAddress"])))).to.deep.equal([defaultParams.platformTokenContractAddress]);
        expect(ethers.utils.defaultAbiCoder.decode(["address"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getAddress", ["borrowerAddress"])))).to.deep.equal([defaultParams.borrowerAddress]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["minFundingCapacity"])))).to.deep.equal([defaultParams.minFundingCapacity]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["maxFundingCapacity"])))).to.deep.equal([defaultParams.maxFundingCapacity]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["fundingPeriodSeconds"])))).to.deep.equal([defaultParams.fundingPeriodSeconds]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["lendingTermSeconds"])))).to.deep.equal([defaultParams.lendingTermSeconds]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["firstLossAssets"])))).to.deep.equal([defaultParams.firstLossAssets]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["borrowerTotalInterestRateWad"])))).to.deep.equal([defaultParams.borrowerTotalInterestRateWad]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["repaymentRecurrenceDays"])))).to.deep.equal([defaultParams.repaymentRecurrenceDays]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["gracePeriodDays"])))).to.deep.equal([defaultParams.gracePeriodDays]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["protocolFeeWad"])))).to.deep.equal([defaultParams.protocolFeeWad]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["penaltyRateWad"])))).to.deep.equal([defaultParams.penaltyRateWad]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["defaultPenalty"])))).to.deep.equal([defaultParams.defaultPenalty]);
        expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getUint256", ["tranchesCount"])))).to.deep.equal([defaultParams.tranchesCount]);


        for(let i = 0; i < defaultParams.tranchesCount; i++) {
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheAPRsWads", i])))).to.deep.equal([defaultParams.trancheAPRsWads[i]]);
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheBoostedAPRsWads", i])))).to.deep.equal([defaultParams.trancheBoostedAPRsWads[i]]);
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheBoostRatios", i])))).to.deep.equal([defaultParams.trancheBoostRatios[i]]);
            expect(ethers.utils.defaultAbiCoder.decode(["uint256"], await poolStorageTester.callStatic.execute(poolStorage.interface.encodeFunctionData("getArrayUint256", ["trancheCoveragesWads", i])))).to.deep.equal([defaultParams.trancheCoveragesWads[i]]);

        }
    });

})