import { ethers } from "hardhat";
import axios from "axios";


async function getCurrentTimestamp() {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp; // This is the current block timestamp
}

function createSim(from: string, to: string, data: string, timestamp?: string) {
    let tx: any = {
        network_id: "1",
        save: true,
        save_if_fails: true,
        simulation_type: "full",
        from: from,
        to: to,
        input: data,
    };

    if (timestamp) {
        tx.block_header = {};
        tx.block_header.timestamp = timestamp;
    }

    return tx;
}

async function shareReport(simulationId: string) {
    const response = await axios.post(`${process.env.TENDERLY_SHARE_ENDPOINT}${simulationId}/share`,
        {
            headers: {
                'X-Access-Key': process.env.TENDERLY_API_TOKEN
            }
        });

    console.log(response)
}

async function generateReport(simulations: any) {
    console.log(simulations)

    const response = await axios.post(process.env.TENDERLY_API_KEY as string,
        {
            simulations
        },
        {
            headers: {
                'X-Access-Key': process.env.TENDERLY_API_TOKEN
            }
        });


    if (!response.data.simulation_results) {
        console.log(response.status)
        console.log(response.statusText)
        console.log(response.data)
        console.log(response.config)
    }

    const sims = response.data.simulation_results;

    // TODO: generate the ids into shareable links
    for (let i = 0; i < sims.length; i++) {
        const id = sims[i].simulation.id;
        console.log(id)
        //await shareReport(id)
    }
}

async function main() {

    const adminMultisig = '0x3346Dd2231de8707FDF673202D790E0B87239f86';
    const borrowerMultisig = '0xb748289127A08AFe00948594Bf431FF138C9e9d4'
    const lenderMultisig = '0x4BAb1a74f32434cc5AE4D7Df2Ec83a60B3fe507E'
    const usdcWhale = '0x134750a99286afc269d17eb791b9b670c6c0c91e'

    const lendingPool = await ethers.getContractAt("LendingPool", '0x248303e0293251ceb742a437e8f0d29c797fe1f2');
    const trancheVault = await ethers.getContractAt("TrancheVault", await lendingPool.trancheVaultAddresses(0));
    const usdc = await ethers.getContractAt("ERC20", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

    const flc = await lendingPool.firstLossAssets();
    const depositAmount = ethers.utils.parseUnits("50000", 6);

    const poolFactory = await ethers.getContractAt("PoolFactory", '0x4089B183566925d0079b74eDd707f0fbE6ff0206')

    const nextTimestampSeconds = await getCurrentTimestamp() + (60 * 60 * 24 * 100);
    const nextTimestampHex = ethers.utils.hexValue(nextTimestampSeconds)

    const simulation = [
        // send flc from usdc whale to borrower multisig
        createSim(usdcWhale, usdc.address, usdc.interface.encodeFunctionData("transfer", [borrowerMultisig, flc])),

        // approve flc deposit and send
        createSim(borrowerMultisig, usdc.address, usdc.interface.encodeFunctionData("approve", [lendingPool.address, flc])),
        createSim(borrowerMultisig, lendingPool.address, lendingPool.interface.encodeFunctionData("borrowerDepositFirstLossCapital")),

        // open pool
        createSim(adminMultisig, lendingPool.address, lendingPool.interface.encodeFunctionData("adminOpenPool")),

        // send $50k to lender
        createSim(usdcWhale, usdc.address, usdc.interface.encodeFunctionData("transfer", [lenderMultisig, depositAmount])),

        // lender provides funds
        createSim(lenderMultisig, usdc.address, usdc.interface.encodeFunctionData("approve", [trancheVault.address, depositAmount])),
        createSim(lenderMultisig, trancheVault.address, trancheVault.interface.encodeFunctionData("deposit", [depositAmount, lenderMultisig])),

        // admin transitions to funded
        createSim(adminMultisig, lendingPool.address, lendingPool.interface.encodeFunctionData("adminTransitionToFundedState"), nextTimestampHex),

        // borrows
        createSim(borrowerMultisig, lendingPool.address, lendingPool.interface.encodeFunctionData("borrow")),

        // borrower returns money
        createSim(borrowerMultisig, usdc.address, usdc.interface.encodeFunctionData("approve", [lendingPool.address, depositAmount])),
        createSim(borrowerMultisig, lendingPool.address, lendingPool.interface.encodeFunctionData("borrowerRepayPrincipal")),

        // borrower recover flc + excess spread
        createSim(borrowerMultisig, lendingPool.address, lendingPool.interface.encodeFunctionData("borrowerWithdrawFirstLossCapitalAndExcessSpread")),
        
        // lender withdraw 50k
        createSim(lenderMultisig, trancheVault.address, trancheVault.interface.encodeFunctionData("withdraw", [depositAmount, lenderMultisig, lenderMultisig]))
    ]

    await generateReport(simulation)
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
