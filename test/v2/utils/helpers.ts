import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers, upgrades } from "hardhat";
import { Component, PoolFactory, PoolStorage, TribalGovernance } from "../../../typechain-types";
import { ADMIN, BORROWER, DEPLOYER, LENDER } from "./constants";

export const getComponentBundleImplementation = async(poolFactory: PoolFactory): Promise<Component[]> => {
    const poolComponentBundleImpl = await poolFactory.getPoolComponents();
    const components: Component[] = [];

    for(let i = 0; i < poolComponentBundleImpl.length; i++) {
        components.push(await ethers.getContractAt("Component", poolComponentBundleImpl[i]));
    }

    return components;
}