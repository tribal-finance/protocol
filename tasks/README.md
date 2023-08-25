# Automated Deployment Pipeline

This README explains the use of `npx hardhat init-protocol` and `./tasks/encode-pool-deploy-staging.sh` commands in the protocol command line tool. 

## npx hardhat init-protocol

The `npx hardhat init-protocol` is a global command with options that are used to initialize a protocol.

You can use the following options:

- `--platform-token`: Link LendingPool to Empty Token or tribal token.
- `--fee-sharing-beneficiaries`: Set the recipients of awards in feeSharing.
- `--fee-sharing-beneficiaries-shares-wad`: Set award allocations.
- `--foundation-address`: The beneficiary of the fee sharing.
- `--lending-pool-params`: Generate a byte string using `npx hardhat encode-pool-initializer`.
- `--stable-coin-address`: The address of the stable coin to use in Lending Pool.

Usage:
```bash
npx hardhat init-protocol --disable-platform-token <STRING> --fee-sharing-beneficiaries <STRING> --fee-sharing-beneficiaries-shares-wad <STRING> --foundation-address <STRING> --lending-pool-params <STRING> --stable-coin-address <STRING>
```

## ./tasks/encode-pool-deploy-staging.sh
The ./tasks/encode-pool-deploy-staging.sh command is a bash script that is used to encode the deployment of a pool for staging. The script is used to define the msg.data for factory deploy that can be passed as parameter to the init-protocol command.

You will be asked to confirm the use of a specific deployer, to select where to begin deployment, and to verify each stage of the deployment process.

Example:
```
./tasks/encode-pool-deploy-staging.sh
```

# Here's what happens at each step of deployment process:

- `npx hardhat clean` is run to ensure fresh deployment artifacts
- `npx hardhat compile` runs to gen artifacts to make verification easy
- [Optional] The `deploy-empty-token` is run if no platform token exists
- The `encode-pool-deploy-staging.sh` script is executed passing the platform token address.
- A long byte string (msg.data) is generated as a result.
- User then may run `npx hardhat init-protocol` passing encoded params to meet msg.data gen requirment
- The user is prompted to confirm the use of an Ethereum address at a certain amount of ether on a specific chain as the deployer.
- The user is asked to select where to begin deployment from a list of options, which include deploying various aspects of the protocol, such as the empty token, the authority proxy, and more.
- The deployment process begins from the chosen starting point. Addresses are provided for each deployed contract.
- *If an error occurs during the deployment, the user is prompted to either retry or skip the request. Press any key to skip or y to retry*

# Hardhat Task - Set Pool State

This README provides a detailed guide for DevOps engineers to use the `set-pool-state` task, which sets the state of a given pool or deploys a fresh pool in a specific state.

## Introduction

The `set-pool-state` task is a utility that allows users to manipulate the state of a given LendingPool or deploy a new LendingPool in a specific state. It utilizes Hardhat as the task runner and interacts with Ethereum smart contracts.

## Prerequisites

- Node.js installed
- Hardhat project initialized
- Familiarity with Ethereum and smart contracts

## Installation

Ensure you have imported the task into your Hardhat configuration.

## Usage

```bash
npx hardhat set-pool-state --stage <STAGE> [options]
```

### Parameters

#### Required:

- `--stage <STAGE>`: The stage to put the pool in. Acceptable values are:
  - [your_stage_options_here]

#### Optional:

- `--poolAddress <ADDRESS>`: The LendingPool's address to set the state. If this parameter is excluded, a new pool will be deployed.
- `--lendingPoolParams <BYTE_STRING>`: This is a massive byte string you should generate using the `npx hardhat encode-pool-initializer --help` command. It is only required if you need to deploy a new pool.
- `--poolFactoryAddress <ADDRESS>`: The address of the factory that should deploy the pool. By default, it will use the latest deployment.

### Example

```bash
npx hardhat set-pool-state --stage your_stage_here --poolAddress 0xYourPoolAddressHere
```

### Important Notes

1. If the `poolAddress` or `poolFactoryAddress` provided is not a valid Ethereum address, the task will throw an error.
2. If no `poolAddress` is provided, the task assumes that a new pool needs to be deployed and thus requires the `lendingPoolParams` parameter.
3. If deploying a new pool without providing `lendingPoolParams`, the task will throw an error since these parameters are essential for the pool's deployment.
4. The task uses the Hardhat runtime environment (`hre`) to interact with Ethereum smart contracts.
5. Always ensure you are interacting with the correct network and smart contract addresses.

## Errors and Troubleshooting

- `pool-address is not a valid address <ADDRESS>`: Check if the provided address is a valid Ethereum address.
- `pool-factory-address is not a valid address <ADDRESS>`: Ensure that the address you provided for the pool factory is valid.
- `lending-pool-params: <PARAMS> a new lending pool requires these encoded params`: If you're deploying a new pool, ensure that you provide the encoded parameters using the `npx hardhat encode-pool-initializer --help` command.
- `stage: <STAGE> is not an element of [your_stage_options_here]`: Ensure you provide a valid stage from the acceptable values list.
