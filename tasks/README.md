# Automated Deployment Pipeline

This README explains the use of `npx hardhat init-protocol` and `./tasks/encode-pool-deploy-staging.sh` commands in the protocol command line tool. 

## npx hardhat init-protocol

The `npx hardhat init-protocol` is a global command with options that are used to initialize a protocol.

You can use the following options:

- `--disable-platform-token`: Link LendingPool to Empty Token.
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

- The encode-pool-deploy-staging.sh script is executed.
- A long byte string (msg.data) is generated as a result.
- User then may run `npx hardhat init-protocol` to meet msg.data gen requirment
- The user is prompted to confirm the use of an Ethereum address at a certain amount of ether on a specific chain as the deployer.
- The user is asked to select where to begin deployment from a list of options, which include deploying various aspects of the protocol, such as the empty token, the authority proxy, and more.
- The deployment process begins from the chosen starting point. Addresses are provided for each deployed contract.
- *If an error occurs during the deployment, the user is prompted to either retry or skip the request. Press any key to skip or y to retry*