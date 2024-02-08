// Import necessary modules
import { ethers } from "hardhat";
import axios from "axios";

async function main() {

    const adminDeployer = '0xb23BAa72FfAC17312FD469134BA562d81E1c2c16';
    const adminMultisig = '0x3346Dd2231de8707FDF673202D790E0B87239f86';

    const authority = await ethers.getContractAt("Authority", "0xe28B7c821B9160dE8cB229A796248ba273C1aEB1");
    const proxyAdmin = await ethers.getContractAt("IProxyAdmin", "0xba84d840783279c3af52d0704c43d1cc1b231b29");
    const poolFactory = await ethers.getContractAt("PoolFactory", "0x4089B183566925d0079b74eDd707f0fbE6ff0206")
    const feeSharing = await ethers.getContractAt("FeeSharing", "0xEe5637ede9eEBba0EBe773186C8508ee4E5f2b79")

    const address1 = proxyAdmin.address

    const transactions = [
        // set multisig to be admin of proxy admin
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("transferOwnership", [adminMultisig])
        },
        // test that deployer cannot change proxy admin due to having lost ownership
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("changeProxyAdmin", [authority.address, adminMultisig])
        },
        // deploy shouldn't be able to call upgrade on any of the contracts
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("upgrade", [authority.address, address1])
        },
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("upgrade", [poolFactory.address, address1])
        },
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("upgrade", [feeSharing.address, address1])
        },

        // admin multisig should be able to upgrade
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminMultisig,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("upgrade", [authority.address, address1])
        },
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminMultisig,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("upgrade", [poolFactory.address, address1])
        },
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminMultisig,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("upgrade", [feeSharing.address, address1])
        },
    ];

    const response = await axios.post(process.env.TENDERLY_API_KEY as string,
        {
            simulations: transactions
        },
        {
            headers: {
                'X-Access-Key': process.env.TENDERLY_API_TOKEN
            }
        });

    

    const sims = response.data.simulation_results;

    for(let i = 0; i < sims.length; i++) {
        console.log(sims[i].simulation.id)
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
