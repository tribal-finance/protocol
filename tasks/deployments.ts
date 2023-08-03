import { task } from "hardhat/config";
import * as readline from 'readline-sync';
import * as fs from 'fs';
import { EthereumProvider } from "hardhat/types";

interface DeploymentInfo {
    contractName: string;
    contractAddress: string;
    implementationAddress?: string;
    timestamp: number;
}

function writeToDeploymentsFile(deployment: DeploymentInfo, network: string): void {
    const fileName = `deployments-${network}.json`;
    const existingDeployments: DeploymentInfo[] = readDeploymentsFromNetwork(network);
    existingDeployments.push(deployment);
    const data = JSON.stringify(existingDeployments, null, 2);
    fs.writeFileSync(fileName, data);
}

function readDeploymentsFromNetwork(network: string): DeploymentInfo[] {
    const fileName = `deployments-${network}.json`;
    try {
        const data = fs.readFileSync(fileName, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function getMostCurrentContract(contractNameToRead: string, network: string): DeploymentInfo {
    const deployments = readDeploymentsFromNetwork(network);

    // Filter deployments by the provided contractNameToRead
    const filteredDeployments = deployments.filter((deployment) => deployment.contractName === contractNameToRead);

    // Find the most recent deployment based on the timestamp
    const mostRecentDeployment = filteredDeployments.reduce((prevDeployment, currentDeployment) => {
        return currentDeployment.timestamp > prevDeployment.timestamp ? currentDeployment : prevDeployment;
    }, filteredDeployments[0]);

    return mostRecentDeployment;
}

async function retryableRequest(reqFunc: () => Promise<void>): Promise<void> {
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

function getNumber(maxLength: number): number {
    let numStr: string;

    do {
        numStr = readline.question('Please enter starting index: ');
    } while (Number(numStr) > maxLength || isNaN(Number(numStr)));

    return Number(numStr);
}

task("init-protocol", "deploys the lending protocol for production")
    .addParam("stableCoinAddress", "This is the address of the desired stable coin address to use in Lending Pool")
    .addParam("disablePlatformToken", "Include this flag in the command to link LendingPool to Empty Token")

    .setAction(async (args: any, hre) => {
        const { ethers, upgrades } = hre;
        const { stableCoinAddress, disablePlatformToken } = args;
        const network = hre.network.name;

        if (!disablePlatformToken) {
            throw Error("No logic to handle protocol initialization with Tribal platform token. Re-run with --disable-platform-token true")
        }

        if (!ethers.utils.isAddress(stableCoinAddress)) {
            throw Error(`--stable-coin-address is not a vaid address '${stableCoinAddress}'`);
        }

        const signers = await ethers.getSigners();
        if (!readline.keyInYN(`Confirm use of ${signers[0].address} at ${ethers.utils.formatEther(await ethers.provider.getBalance(signers[0].address))} eth on chain: ${network}.${ethers.provider.network.chainId} as your deployer?`)) {
            console.log("Update your deployer key in hardhat config");
            process.exit(-1);
        }


        const deploySequence = []

        deploySequence.push("Deploys and verifies the empty token", () => retryableRequest(async () => {
            const PlatformToken = await ethers.getContractFactory("EmptyToken");
            const platformToken = await PlatformToken.deploy();
            await platformToken.deployed();
            console.log("Deployed Empty Platform Token to", platformToken.address);

            writeToDeploymentsFile({
                contractName: "platformToken",
                contractAddress: platformToken.address,
                timestamp: await ethers.provider.getBlockNumber()
            }, network)

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: platformToken.address,
                    constructorArguments: [],
                });
                console.log("verified empty token")
            })
        }));

        deploySequence.push("Deploys authority as proxy and verifies the implementation", () => retryableRequest(async () => {
            const Authority = await ethers.getContractFactory("Authority");
            const authority = await upgrades.deployProxy(Authority, []);
            await authority.deployed();
            console.log("Authority proxy deployed to: ", authority.address);
            const impl = "0x"+(await ethers.provider.getStorageAt(authority.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')).slice(-40);

            
            console.log("Authority implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "authority",
                contractAddress: authority.address,
                implementationAddress: impl,
                timestamp: await ethers.provider.getBlockNumber()
            }, network)

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: impl,
                    constructorArguments: [],
                });
                console.log("verified implementation")
            })
        }))

        deploySequence.push("Deploys staking as proxy and verifies the implementation", () => retryableRequest(async () => {
            const authorityAddress = getMostCurrentContract("authority", network).contractAddress;
            const platformTokenAddress = getMostCurrentContract("platformToken", network).contractAddress;

            const Staking = await ethers.getContractFactory("Staking");
            const staking = await upgrades.deployProxy(Staking, [
              authorityAddress,
              platformTokenAddress,
              stableCoinAddress,
              60,
            ]);

            await staking.deployed();
            console.log("Staking proxy deployed to: ", staking.address);

            const impl = "0x"+(await ethers.provider.getStorageAt(staking.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')).slice(-40);


            console.log("Staking implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "staking",
                contractAddress: staking.address,
                implementationAddress: impl,
                timestamp: await ethers.provider.getBlockNumber()
            }, network)

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: impl,
                    constructorArguments: [],
                });
                console.log("verified implementation")
            })
        }))


        console.log("Select where to begin deployment")
        for (let i = 0; i < deploySequence.length; i += 2) {
            console.log(`[${i / 2}] ${deploySequence[i]} `)
        }

        const index = getNumber((deploySequence.length / 2) - 1);
        console.log(`Entered: ${index}`)

        for (let i = index * 2; i < deploySequence.length; i += 2) {
            const promise = deploySequence[i + 1] as () => Promise<void>;;
            await promise();
        }

    })