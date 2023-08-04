import { task } from "hardhat/config";
import * as readline from 'readline-sync';
import {getMostCurrentContract, writeToDeploymentsFile} from "./io";
import { getNumber, retryableRequest } from "./utils";

task("init-protocol", "deploys the lending protocol for production")
    .addParam("stableCoinAddress", "This is the address of the desired stable coin address to use in Lending Pool")
    .addParam("disablePlatformToken", "Include this flag in the command to link LendingPool to Empty Token")
    .addParam("foundationAddress", "This is the beneficiary of the fee sharing")
    .addParam("lendingPoolParams", "This is a massive byte string you should generate using `npx hardhat encode-pool-initializer --help`")

    .setAction(async (args: any, hre) => {
        const { ethers, upgrades } = hre;
        const { stableCoinAddress, disablePlatformToken, foundationAddress, lendingPoolParams } = args;
        const network = hre.network.name;

        if (!disablePlatformToken) {
            throw Error("No logic to handle protocol initialization with Tribal platform token. Re-run with --disable-platform-token true")
        }

        if (!ethers.utils.isAddress(stableCoinAddress)) {
            throw Error(`--stable-coin-address is not a vaid address '${stableCoinAddress}'`);
        }

        if (!ethers.utils.isAddress(foundationAddress)) {
            throw Error(`--foundation-address is not a vaid address '${foundationAddress}'`);
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

        deploySequence.push("Deploys poolFactory as proxy and verifies the implementation", () => retryableRequest(async () => {
            const authorityAddress = getMostCurrentContract("authority", network).contractAddress;

            const PoolFactory = await ethers.getContractFactory("PoolFactory");
            const poolFactory = await upgrades.deployProxy(PoolFactory, [
                authorityAddress,
            ]);
            await poolFactory.deployed();
          
            console.log("Pool Factory proxy deployed to: ", poolFactory.address);

            const impl = "0x"+(await ethers.provider.getStorageAt(poolFactory.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')).slice(-40);

            console.log("Pool Factory implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "poolFactory",
                contractAddress: poolFactory.address,
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

        deploySequence.push("Deploy lending pool so factory can clone it", () => retryableRequest(async () => {
            const PoolCalculations = await ethers.getContractFactory("PoolCalculations");
            const poolCalculations = await PoolCalculations.deploy();
            await poolCalculations.deployed();
          
            const PoolTransfers = await ethers.getContractFactory("PoolTransfers");
            const poolTransfers = await PoolTransfers.deploy();
            await poolTransfers.deployed();
          
            const LendingPool = await ethers.getContractFactory("LendingPool", {
              libraries: {
                PoolCalculations: poolCalculations.address,
                PoolTransfers: poolTransfers.address
              }
            });
            
            const lp = await LendingPool.deploy();
            console.log(`LendingPool implementation deployed to ${lp.address}`);

            const Factory = getMostCurrentContract("poolFactory", network);
            const factory = await ethers.getContractAt("PoolFactory", Factory.contractAddress);

            await factory.setPoolImplementation(lp.address);
            console.log("implementation address is set on poolFactory");

            writeToDeploymentsFile({
                contractName: "lendingPoolV1",
                contractAddress: lp.address,
                timestamp: await ethers.provider.getBlockNumber()
            }, network)

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: lp.address,
                    constructorArguments: [],
                });
                console.log("verified implementation")
            })
        }))

        deploySequence.push("Deploy Lending Pool and Vaults through Pool Factory", () => retryableRequest(async () => {
            const Factory = getMostCurrentContract("poolFactory", network);
            const factory = await ethers.getContractAt("PoolFactory", Factory.contractAddress);
            
            await signers[0].sendTransaction({
                to: factory.address,
                data: lendingPoolParams
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