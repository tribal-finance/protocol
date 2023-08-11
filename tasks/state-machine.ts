import { task } from "hardhat/config";
import STAGES, { STAGES_LOOKUP, STAGES_LOOKUP_STR } from "../test/helpers/stages";
import { processLendingPoolParams } from "./utils";
import { LendingPool, PoolFactory } from "../typechain-types";
import { getMostCurrentContract } from "./io";


task("set-pool-state", "Sets the state of a given pool or deploys a fresh pool in a specific state")
    .addOptionalParam("poolAddress", "The LendingPool's address to set the state, if this param is excluded, a new pool will be deployed")
    .addOptionalParam("lendingPoolParams", "This is a massive byte string you should generate using `npx hardhat encode-pool-initializer --help` it is only required if you need to deploy a new pool")
    .addOptionalParam("poolFactoryAddress", "The address of the factory that should deploy the pool, by default, it will use the latest deployment")
    .addParam("stage", `The stage to put the pool in, acceptable values: [${Object.keys(STAGES).map((value, index) => {
        return (index != 0 ? " " : "") + value.toLowerCase();
    })}]`)
    .setAction(async (taskArgs, hre) => {
        const {ethers} = hre;
        const {parseEther, isAddress} = ethers.utils;
        const {poolAddress, poolFactoryAddress, stage, lendingPoolParams} = taskArgs;
        const network = hre.network.name;

        if(poolAddress && !isAddress(poolAddress)) {
            throw new Error(`pool-address is not a valid address ${poolAddress}`);
        }

        if(poolFactoryAddress && !isAddress(poolFactoryAddress)) {
            throw new Error(`pool-factory-address is not a valid address ${poolFactoryAddress}`);
        }

        let poolFactory: PoolFactory = !poolFactoryAddress ? await ethers.getContractAt("PoolFactory", getMostCurrentContract("poolFactory", network).contractAddress) : await ethers.getContractAt("PoolFactory", poolFactoryAddress);

        if(!poolAddress) {
            // require lendingPoolParams to not be null
            console.log("No pool-address provided, deploying new pool...")
            if(!lendingPoolParams) {
                throw new Error(`lending-pool-params: ${lendingPoolParams} a new lending pool requires these encoded params`)
            }

            await processLendingPoolParams(ethers, poolFactory, lendingPoolParams, network);
            console.log("Deployed fresh LendingPool.")
        }

        let lendingPool: LendingPool = !poolAddress ? await ethers.getContractAt("LendingPool", getMostCurrentContract("lendingPoolV1", network).contractAddress) : await ethers.getContractAt("LendingPool", poolAddress);
        const desiredStage = STAGES_LOOKUP_STR[`${stage.toUpperCase()}`];

        console.log(`LendingPool at ${lendingPool.address} will be set to ${desiredStage}`)

        if(!desiredStage) {
            throw new Error(`stage: ${stage} is not an element of [${Object.keys(STAGES).map((value, index) => {
                return (index != 0 ? " " : "") + value.toLowerCase();
            })}]`)
        }


    });
