import { task } from "hardhat/config";
import STAGES from "../test/helpers/stages";


task("set-pool-state", "Sets the state of a given pool or deploys a fresh pool in a specific state")
    .addOptionalParam("poolAddress", "The LendingPool's address to set the state, if this param is excluded, a new pool will be deployed")
    .addOptionalParam("poolFactoryAddress", "The address of the factory that should deploy the pool, by default, it will use the latest deployment")
    .addParam("stage", "The stage to put the pool in.")
    .setAction(async (taskArgs, hre) => {
        const {ethers} = hre;
        const {parseEther, isAddress} = ethers.utils;
        const {poolAddress, poolFactoryAddress} = taskArgs;

        if(poolAddress && !isAddress(poolAddress)) {
            throw new Error(`pool-address is not a valid address ${poolAddress}`);
        }

        if(poolFactoryAddress && !isAddress(poolFactoryAddress)) {
            throw new Error(`pool-factory-address is not a valid address ${poolFactoryAddress}`);
        }

        

    });
