import * as readline from 'readline-sync';
import { writeToDeploymentsFile } from './io';
import { PoolFactory } from '../typechain-types';

export async function retryableRequest(reqFunc: () => Promise<void>): Promise<void> {
    try {
        await reqFunc();
    } catch (error) {
        console.error(error);
        if (readline.keyInYN('An error occurred. Do you want to retry?')) {
            await retryableRequest(reqFunc);
        } else {
            console.log("Skipping request...")
        }
    }
}

export function getNumber(maxLength: number): number {
    let numStr: string;

    do {
        numStr = readline.question('Please enter starting index: ');
    } while (Number(numStr) > maxLength || isNaN(Number(numStr)));

    return Number(numStr);
}

export async function processLendingPoolParams(ethers: any, factory: PoolFactory, lendingPoolParams: string, network: string) {
    const signers = await ethers.getSigners();

    lendingPoolParams = lendingPoolParams.trim();

    const tx = await signers[0].sendTransaction({
        to: factory.address,
        data: lendingPoolParams
    })

    const receipt = await tx.wait();
    const timestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

    receipt.logs.forEach((log: any) => {
        try {
            const parsedLog = factory.interface.parseLog(log);
            if (parsedLog.name === 'TrancheVaultCloned') {
                writeToDeploymentsFile({
                    contractName: "trancheVaultV1",
                    contractAddress: parsedLog.args.addr,
                    timestamp: timestamp
                }, network)
            }
            if(parsedLog.name === 'PoolCloned') {
                writeToDeploymentsFile({
                    contractName: "lendingPoolV1",
                    contractAddress: parsedLog.args.addr,
                    timestamp: timestamp
                }, network)
            }
        } catch (error) {}
    });
}