import { task } from "hardhat/config";
import * as readline from 'readline-sync';
import {getMostCurrentContract, getMostCurrentContracts, writeToDeploymentsFile} from "./io";
import { getNumber, retryableRequest } from "./utils";
import { BigNumberish } from "ethers";

task("deploy-empty-token", "deploys the 'no-platform-token'")
    .setAction(async (args: any, hre) => {
        const { ethers, upgrades } = hre;
        const network = hre.network.name;

        await retryableRequest(async () => {
            const PlatformToken = await ethers.getContractFactory("EmptyToken");
            const platformToken = await PlatformToken.deploy();
            await platformToken.deployed();
            console.log("Deployed Empty Platform Token to", platformToken.address);

            writeToDeploymentsFile({
                contractName: "platformToken",
                contractAddress: platformToken.address,
                timestamp: (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
            }, network)
        });

        await retryableRequest(async () => {
            const platformTokenAddress = getMostCurrentContract("platformToken", network).contractAddress;

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: platformTokenAddress,
                    constructorArguments: [],
                });
                console.log("verified empty token")
            })
        })
    })

task("init-protocol", "deploys the lending protocol for production")
    .addParam("stableCoinAddress", "This is the address of the desired stable coin address to use in Lending Pool")
    .addParam("foundationAddress", "This is the beneficiary of the fee sharing")
    .addParam("lendingPoolParams", "This is a massive byte string you should generate using `npx hardhat encode-pool-initializer --help`")
    .addParam("feeSharingBeneficiaries", "Sets who recieves awards in feeSharing. Enter param in this format <addr1,addr2,...,addrN>")
    .addParam("feeSharingBeneficiariesSharesWad", "Sets award alocations. Enter Param in this format using floats <0.3,0.1,...,.5> Must add to 1")
    .addParam("owner", "Address of the timelock, multisig, or governor to switch to after deployment")

    .setAction(async (args: any, hre) => {
        const { ethers, upgrades } = hre;
        const {BigNumber} = ethers;
        const {parseEther} = ethers.utils;
        const { stableCoinAddress, owner, foundationAddress, lendingPoolParams, feeSharingBeneficiaries, feeSharingBeneficiariesSharesWad } = args;
        const network = hre.network.name;

        if (!ethers.utils.isAddress(stableCoinAddress)) {
            throw Error(`--stable-coin-address is not a vaid address '${stableCoinAddress}'`);
        }

        if (!ethers.utils.isAddress(foundationAddress)) {
            throw Error(`--foundation-address is not a vaid address '${foundationAddress}'`);
        }

        if (!ethers.utils.isAddress(owner)) {
            throw Error(`--owner is not a vaid address '${owner}'`);
        }

        const feeShareBeneficiariesParsed = feeSharingBeneficiaries.split(',')
        feeShareBeneficiariesParsed.forEach((addr: string) => {
            if (!ethers.utils.isAddress(addr)) {
                throw Error(`--fee-sharing-address is not a vaid address '${addr}'`);
            }
        });

        const feeSharingBeneficiariesSharesWadParsed = feeSharingBeneficiariesSharesWad.split(',').map(parseEther)
        var sum = BigNumber.from(0);
        feeSharingBeneficiariesSharesWadParsed.forEach((num: BigNumberish) => {
            sum = sum.add(num);
        })
        if(!sum.eq(parseEther("1"))) {
            throw Error(`Sum of all feeSharing portions should be ${parseEther("1")}, actual: ${sum.toString()}`);
        }

        const signers = await ethers.getSigners();
        if (!readline.keyInYN(`Confirm use of ${signers[0].address} at ${ethers.utils.formatEther(await ethers.provider.getBalance(signers[0].address))} eth on chain: ${network}.${ethers.provider.network.chainId} as your deployer?`)) {
            console.log("Update your deployer key in hardhat config");
            process.exit(-1);
        }

        const deploySequence = []
        const secureDeploymentChecksum: string[] = []

        deploySequence.push("Deploys authority as proxy", () => retryableRequest(async () => {
            const Authority = await ethers.getContractFactory("Authority");
            const authority = await upgrades.deployProxy(Authority, []);
            await authority.deployed();
            console.log("Authority proxy deployed to: ", authority.address);
            const impl = "0x"+(await ethers.provider.getStorageAt(authority.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')).slice(-40);

            secureDeploymentChecksum.push(authority.deployTransaction.data);

            console.log("Authority implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "authority",
                contractAddress: authority.address,
                implementationAddress: impl,
                timestamp: (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
            }, network)
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

            secureDeploymentChecksum.push(staking.deployTransaction.data);

            console.log("Staking implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "staking",
                contractAddress: staking.address,
                implementationAddress: impl,
                timestamp: (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
            }, network)
        }))


        deploySequence.push("Deploys poolFactory as proxy", () => retryableRequest(async () => {
            const authorityAddress = getMostCurrentContract("authority", network).contractAddress;

            const PoolFactory = await ethers.getContractFactory("PoolFactory");
            const poolFactory = await upgrades.deployProxy(PoolFactory, [
                authorityAddress,
            ]);
            await poolFactory.deployed();
          
            console.log("Pool Factory proxy deployed to: ", poolFactory.address);

            const impl = "0x"+(await ethers.provider.getStorageAt(poolFactory.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')).slice(-40);
            
            secureDeploymentChecksum.push(poolFactory.deployTransaction.data);

            console.log("Pool Factory implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "poolFactory",
                contractAddress: poolFactory.address,
                implementationAddress: impl,
                timestamp: (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
            }, network)
        }))

        deploySequence.push("Deploy Fee Sharing and set its address for Pool Factory", () => retryableRequest(async () => {
            const FeeSharing = await ethers.getContractFactory("FeeSharing");
            const authorityAddress = getMostCurrentContract("authority", network).contractAddress;
            const poolFactoryAddress = getMostCurrentContract("poolFactory", network).contractAddress;

            const params = [
                authorityAddress,
                stableCoinAddress,
                Array.isArray(feeShareBeneficiariesParsed) ? feeShareBeneficiariesParsed : [feeShareBeneficiariesParsed],
                Array.isArray(feeSharingBeneficiariesSharesWadParsed) ? feeSharingBeneficiariesSharesWadParsed : [feeSharingBeneficiariesSharesWadParsed],
            ];
            const feeSharing = await upgrades.deployProxy(FeeSharing, params);
            await feeSharing.deployed();
            console.log("Fee Sharing contract deployed to: ", feeSharing.address);
            
            secureDeploymentChecksum.push(feeSharing.deployTransaction.data);

            const impl = "0x"+(await ethers.provider.getStorageAt(feeSharing.address, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')).slice(-40);
            console.log("Fee Sharing implementation deployed to address: ", impl);

            writeToDeploymentsFile({
                contractName: "feeSharing",
                contractAddress: feeSharing.address,
                implementationAddress: impl,
                timestamp: (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
            }, network)

            const poolFactory = await ethers.getContractAt("PoolFactory", poolFactoryAddress);
            const tx = await poolFactory.setFeeSharingContractAddress(feeSharing.address);
            secureDeploymentChecksum.push(tx.data);
            console.log("Set feeSharing address in poolFactory")
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
            secureDeploymentChecksum.push(lp.deployTransaction.data);

            const Factory = getMostCurrentContract("poolFactory", network);
            const factory = await ethers.getContractAt("PoolFactory", Factory.contractAddress);

            const tx = await factory.setPoolImplementation(lp.address);
            console.log("implementation address is set on poolFactory");
            secureDeploymentChecksum.push(tx.data);

            writeToDeploymentsFile({
                contractName: "lendingPoolV1-clonable",
                contractAddress: lp.address,
                timestamp: (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
            }, network)
        }))

        deploySequence.push("Deploy Tranche Vault and set implementation within pool factory", () => retryableRequest(async () => {
            const TrancheVault = await ethers.getContractFactory("TrancheVault");
            const tv = await TrancheVault.deploy();
            await tv.deployed();

            secureDeploymentChecksum.push(tv.deployTransaction.data);

            console.log(`TrancheVault implementation deployed to ${tv.address}`);

            writeToDeploymentsFile({
                contractName: "trancheVaultV1-clonable",
                contractAddress: tv.address,
                timestamp: (await ethers.provider.getBlock(ethers.provider.getBlockNumber())).timestamp
            }, network)

            const Factory = getMostCurrentContract("poolFactory", network);
            const factory = await ethers.getContractAt("PoolFactory", Factory.contractAddress);

            const tx = await factory.setTrancheVaultImplementation(tv.address);
            console.log("implementation address is set on poolFactory");
            secureDeploymentChecksum.push(tx.data);

        }))

        deploySequence.push("Deploy Lending Pool and Vaults through Pool Factory", () => retryableRequest(async () => {
            const Factory = getMostCurrentContract("poolFactory", network);
            const factory = await ethers.getContractAt("PoolFactory", Factory.contractAddress);
            const tx = await signers[0].sendTransaction({
                to: factory.address,
                data: lendingPoolParams
            })
            secureDeploymentChecksum.push(tx.data);

            const receipt = await tx.wait();
            const timestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp

            receipt.logs.forEach(log => {
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
        }))

        deploySequence.push("Transfer ownship out of software wallet", () => retryableRequest(async () => {
            const authorityAddress = getMostCurrentContract("authority", network).contractAddress;
            const authority = await ethers.getContractAt("Authority", authorityAddress);
            const tx = await authority.transferOwnership(owner);
            secureDeploymentChecksum.push(tx.data);
            console.log(`Transfered ownership from deployer ${signers[0].address} to ${owner}`);
        }))

        deploySequence.push("Validate deployment was neither hijacked nor tampered", () => retryableRequest(async () => {
            var checksum = "";
            secureDeploymentChecksum.sort();
            for(let i = 0; i < secureDeploymentChecksum.length; i++) {
                checksum += secureDeploymentChecksum[i];
            }
            let bytes = ethers.utils.toUtf8Bytes(checksum);
            const expected = ethers.utils.keccak256(bytes)
            console.log("Expected Transactional Checksum: ", expected)
            console.log("skipping...")
            return;
            console.log("Generating Actual, This may take a few minutes...") 
            const actualChecksome: string[] = []
            const dataSources = [
                "platformToken",
                "authority",
                "staking",
                "poolFactory",
                "feeSharing",
                "lendingPoolV1",
                "lendingPoolV1-clonable",
                "trancheVaultV1",
                "trancheVaultV1-clonable"
            ]

            const sourceAddresses: string[] = []
            dataSources.forEach(source => {
                const contracts = getMostCurrentContracts(source, network)
                for(let i = 0; i < contracts.length; i++) {
                    sourceAddresses.push(contracts[i].contractAddress)
                }
            })

            for(let i = 0; i <sourceAddresses.length; i++) {
                const transactionCount = await ethers.provider.getTransactionCount(sourceAddresses[i], 'latest');

            }
        }))

        deploySequence.push("Verifies authority implementation", () => retryableRequest(async () => {
            const authorityAddress = getMostCurrentContract("authority", network).implementationAddress;

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: authorityAddress,
                    constructorArguments: [],
                });
                console.log("verified empty token")
            })
        }))

        deploySequence.push("Verifies staking implementation", () => retryableRequest(async () => {
            const stakingAddr = getMostCurrentContract("staking", network).implementationAddress;

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: stakingAddr,
                    constructorArguments: [],
                });
                console.log("verified staking contract")
            })
        }))

        deploySequence.push("Verifies poolFactory implementation", () => retryableRequest(async () => {
            const poolFactoryAddress = getMostCurrentContract("poolFactory", network).implementationAddress;

            await retryableRequest(async () => {
                await hre.run("verify:verify", {
                    address: poolFactoryAddress,
                    constructorArguments: [],
                });
                console.log("verified poolFactory implementation")
            })
        }))

        deploySequence.push("Verify Fee Sharing implementation", () => retryableRequest(async () => {
            const feeSharingImpl = getMostCurrentContract("feeSharing", network).implementationAddress;

            await hre.run("verify:verify", {
                address: feeSharingImpl,
                constructorArguments: [],
            });
            console.log("verified feeSharing implementation")
        }))

        deploySequence.push("Verify LendingPool implementation", () => retryableRequest(async () => {
            const pool = getMostCurrentContract("lendingPoolV1", network).contractAddress;

            await hre.run("verify:verify", {
                address: pool,
                constructorArguments: [],
            });
            console.log("verified Lending Pool implementation")
        }))

        deploySequence.push("Verify TrancheVault implementation", () => retryableRequest(async () => {
            const tv = getMostCurrentContract("trancheVaultV1", network).contractAddress;

            await hre.run("verify:verify", {
                address: tv,
                constructorArguments: [],
            });
            console.log("verified Lending Pool implementation")
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