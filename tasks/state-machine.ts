import { task } from "hardhat/config";
import STAGES, { STAGES_LOOKUP, STAGES_LOOKUP_STR, isValidTransition } from "../test/helpers/stages";
import { processLendingPoolParams } from "./utils";
import { LendingPool, PoolFactory } from "../typechain-types";
import { getMostCurrentContract } from "./io";
import { ethers } from "hardhat";

const getTestnetSigners = async () => {
    const deployerKey = process.env.GOERLI_DEPLOYER_KEY;
    if (!deployerKey) {
        throw new Error('GOERLI_DEPLOYER_KEY is not set in the environment.');
    }
    const lender1Key = process.env.GOERLI_LENDER1_KEY;
    if (!lender1Key) {
        throw new Error('GOERLI_LENDER1_KEY is not set in the environment.');
    }
    const lender2Key = process.env.GOERLI_LENDER2_KEY;
    if (!lender2Key) {
        throw new Error('GOERLI_LENDER2_KEY is not set in the environment.');
    }
    const borrowerKey = process.env.GOERLI_BORROWER_KEY;
    if (!borrowerKey) {
        throw new Error('GOERLI_BORROWER_KEY is not set in the environment.');
    }

    const deployer = new ethers.Wallet(deployerKey, ethers.provider);
    const lender1 = new ethers.Wallet(lender1Key, ethers.provider);
    const lender2 = new ethers.Wallet(lender2Key, ethers.provider);
    const borrower = new ethers.Wallet(borrowerKey, ethers.provider);

    return {
        deployer,
        lender1,
        lender2,
        borrower
    }
}

const moveFromInitialToOpen = async () => {

}


task("set-pool-state", "Sets the state of a given pool or deploys a fresh pool in a specific state")
    .addOptionalParam("poolAddress", "The LendingPool's address to set the state, if this param is excluded, a new pool will be deployed")
    .addOptionalParam("lendingPoolParams", "This is a massive byte string you should generate using `npx hardhat encode-pool-initializer --help` it is only required if you need to deploy a new pool")
    .addOptionalParam("poolFactoryAddress", "The address of the factory that should deploy the pool, by default, it will use the latest deployment")
    .addParam("stage", `The stage to put the pool in, acceptable values: [${Object.keys(STAGES).map((value, index) => {
        return (index != 0 ? " " : "") + value.toLowerCase();
    })}]`)
    .setAction(async (taskArgs, hre) => {
        const { ethers } = hre;
        const { parseEther, isAddress } = ethers.utils;
        const { poolAddress, poolFactoryAddress, stage, lendingPoolParams } = taskArgs;
        const network = hre.network.name;

        if (poolAddress && !isAddress(poolAddress)) {
            throw new Error(`pool-address is not a valid address ${poolAddress}`);
        }

        if (poolFactoryAddress && !isAddress(poolFactoryAddress)) {
            throw new Error(`pool-factory-address is not a valid address ${poolFactoryAddress}`);
        }

        let poolFactory: PoolFactory = !poolFactoryAddress ? await ethers.getContractAt("PoolFactory", getMostCurrentContract("poolFactory", network).contractAddress) : await ethers.getContractAt("PoolFactory", poolFactoryAddress);

        if (!poolAddress) {
            // require lendingPoolParams to not be null
            console.log("No pool-address provided, deploying new pool...")
            if (!lendingPoolParams) {
                throw new Error(`lending-pool-params: ${lendingPoolParams} a new lending pool requires these encoded params`)
            }

            await processLendingPoolParams(ethers, poolFactory, lendingPoolParams, network);
            console.log("Deployed fresh LendingPool.")
        }

        let lendingPool: LendingPool = !poolAddress ? await ethers.getContractAt("LendingPool", getMostCurrentContract("lendingPoolV1", network).contractAddress) : await ethers.getContractAt("LendingPool", poolAddress);
        const desiredStage = STAGES_LOOKUP_STR[`${stage.toUpperCase()}`];
        const desiredStageAsInt = STAGES[`${desiredStage}`];
        const currentStage = parseInt((await lendingPool.currentStage()).toString());

        if(!isValidTransition(currentStage, desiredStageAsInt)) {
            throw new Error(`Cannot transition from ${STAGES_LOOKUP[currentStage]} to ${desiredStage}`)
        }

        console.log(`LendingPool at ${lendingPool.address} will be set to ${desiredStage} from ${STAGES_LOOKUP[currentStage]}`)

        if (!desiredStage) {
            throw new Error(`stage: ${stage} is not an element of [${Object.keys(STAGES).map((value, index) => {
                return (index != 0 ? " " : "") + value.toLowerCase();
            })}]`)
        }


    });
