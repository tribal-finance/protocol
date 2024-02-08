// Import necessary modules
import { ethers } from "hardhat";
import axios from "axios";

async function main() {

    const adminDeployer = '0xb23BAa72FfAC17312FD469134BA562d81E1c2c16';
    const adminMultisig = '0x3346Dd2231de8707FDF673202D790E0B87239f86';

    const authority = await ethers.getContractAt("Authority", "0xe28B7c821B9160dE8cB229A796248ba273C1aEB1");
    const proxyAdmin = await ethers.getContractAt("IProxyAdmin", "0xba84d840783279c3af52d0704c43d1cc1b231b29");

    const transactions = [
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("transferOwnership", [adminMultisig])
        },
        {
            network_id: "1",
            save: true,
            save_if_fails: true,
            simulation_type: "full",
            from: adminDeployer,
            to: proxyAdmin.address,
            input: proxyAdmin.interface.encodeFunctionData("changeProxyAdmin", [authority.address, adminMultisig])
        }
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

    console.log(JSON.stringify(response.data, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
