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

export async function getNextAddresses(
    deployer: SignerWithAddress,
    numberOfDeployments: number,
  ): Promise<string[]> {
    const addresses: string[] = [];
  
    for (let i = 0; i < numberOfDeployments; i++) {
      const nonce = await deployer.getTransactionCount();
      const address = ethers.utils.getContractAddress({
        from: await deployer.getAddress(),
        nonce: nonce + i,
      });
  
      addresses.push(address);
    }
  
    return addresses;
  }