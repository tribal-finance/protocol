# Smart Contracts Overview

## Pool Factory

The PoolFactory contract is the central contract in this lending platform. It is responsible for creating and managing individual lending pools.

Here's a high-level overview of the PoolFactory contract:

Contract References: The PoolFactory contract holds references to the implementation contracts for the pools (poolImplementationAddress) and the tranches (trancheVaultImplementationAddress). These addresses are used to clone new instances of pools and tranches when needed.

Pool Creation: The deployPool function is used to create a new pool. It validates the parameters, clones the pool and tranche vaults, initializes the pool, and creates a record of the pool in the poolRegistry.

Tranche Creation: The \_deployTrancheVaults function is used to create the tranches for a pool. It clones the tranche vault implementation for each tranche, initializes the tranche vault, and transfers ownership to the caller.

Pool Records: The poolRegistry array holds records of all the pools that have been created. Each record includes the name and token of the pool, the addresses of the pool and its tranches, and the addresses of the pool and tranche vault implementations.

Access Control: The contract uses the AuthorityAware contract for access control. Only the owner or an admin can set the implementation addresses and deploy new pools.

Predicting Addresses: The contract includes functions for predicting the addresses of future pools and tranches. This is done using the Clones.predictDeterministicAddress function with the implementation address and a nonce as inputs.

Given the PoolFactory contract address, an indexer can fetch all the data from the pools by iterating over the poolRegistry array and querying each pool and its tranches. This makes the PoolFactory contract a single point of reference for all the pools in the platform.

## Lending Pool

The LendingPool contract represents an individual lending pool in the platform. Here's a high-level overview:

Tranche Types: A LendingPool can be either a unitranche or a multitranche pool. A unitranche pool has a single tranche, while a multitranche pool has multiple tranches, each with its own interest rate and risk level. The number and types of tranches are defined when the pool is created.

Pool Stages: The pool goes through several stages, each representing a different state of the loan process. These stages are:

* Open: The pool is open for funding.
* Borrowed: The funds have been borrowed and the loan is active.
* Repaid: The loan has been fully repaid.
* Default: The borrower has defaulted on their loan.
* Delinquent: The borrower is late on their repayment.
* Underfunded: The pool did not reach its minimum funding capacity.

Interest and Rewards: The pool calculates and distributes interest to lenders based on their share of the total pool funding. It also handles the claiming of rewards for lenders, as seen in the \_claimTrancheInterestForLender function.

Relationship with PoolFactory: The LendingPool contract is deployed and managed by the PoolFactory contract. The PoolFactory holds the address of the LendingPool implementation and clones it to create new pools. It also holds references to the addresses of all deployed pools, allowing it to manage and interact with them.

Events: The LendingPool contract emits events to signal important actions, such as when a borrower borrows from the pool, repays their loan, or withdraws their first loss capital. These events can be used by indexers to track the state of the pool and its transactions.

Access Control: The LendingPool contract uses modifiers like whenNotPaused to control access to its functions and prevent them from being called when the contract is paused.

## Authority Contract

This contract manages the access control for the protocol.

Access Lists: The contract maintains three lists, whitelistedBorrowers, whitelistedLenders, and admins. These are sets of addresses representing the whitelisted borrowers, lenders, and admins respectively.

Adding and Removing Borrowers: The addBorrower and removeBorrower functions allow the contract owner or an admin to add or remove addresses from the whitelistedBorrowers set.

Adding and Removing Lenders: Similarly, the addLender and removeLender functions allow the contract owner or an admin to add or remove addresses from the whitelistedLenders set.

Adding and Removing Admins: The addAdmin and removeAdmin functions allow the contract owner or an admin to add or remove addresses from the admins set.

Checking Whitelist Status: The isWhitelistedBorrower, isWhitelistedLender, and isAdmin functions allow anyone to check if a given address is in the respective whitelist.

Getting All Addresses: The allBorrowers, allLenders, and allAdmins functions allow anyone to get an array of all addresses in the respective whitelist.

The contract uses the onlyOwnerOrAdmin modifier to restrict who can call certain functions. This modifier allows only the contract owner or an admin to call the function. The contract owner is set when the contract is deployed and can be transferred. Admins can be added or removed by the contract owner or other admins.

## Fee Sharing

State: The contract maintains several state variables, including assetContract (the ERC20 token to be distributed), beneficiaries (the addresses to receive the fees), and beneficiariesSharesWad (the proportion of fees each beneficiary receives).

Initialization: The initialize function sets up the contract. It sets the assetContract, initializes the contract's ownership and authority, and sets the initial beneficiaries and their shares.

Updating Beneficiaries and Shares: The updateBenificiariesAndShares and updateShares functions allow the contract owner or an admin to update the beneficiaries and their shares. The shares must always sum to 100%.

Fee Distribution: The distributeFees function distributes the fees held by the contract to the beneficiaries. The first beneficiary is assumed to be a staking contract and is treated specially: the fees are approved for the staking contract and then added as rewards. The other beneficiaries simply receive a transfer of their share of the fees.

Staking Contract Address: The stakingContract function returns the address of the staking contract, which is assumed to be the first beneficiary.

## Staking

The Staking contract allows users to stake platform tokens and earn a portion of the platform's fee shares.

Here's a high-level overview of what the contract does:

ERC20 Tokens:

* stakingToken: The ERC-20 token that users will stake.
* rewardToken: The ERC-20 token used to distribute rewards to stakers.

cooldownPeriodSeconds: A defined cooldown period in seconds, used for unstaking operations.

Users can stake stakingToken and earn rewards in rewardToken.
The contract keeps track of each user's staked balance and the total staked amount.

The contract uses a discrete staking rewards mechanism, inspired by examples from solidity-by-example.org and Synthetix's staking contract.
Reward distribution is based on the individual staking balance and overall reward pool.

Users can request to unstake their tokens, which then enters a cooldown period.
After the cooldown, users can complete the unstaking process.

## TrancheVault

The TrancheVault is designed to represent a tranche within a lending pool. The contract manages the interactions and rules around a specific tranche, including depositing, withdrawing, and handling assets.

State Variables and Events:

The contract contains several state variables (s_id, s_poolAddress, s_minFundingCapacity, s_maxFundingCapacity, s_withdrawEnabled, s_depositEnabled, s_transferEnabled, s_defaultRatioWad) to store key details about the tranche, such as its ID, associated pool, funding limits, and operational statuses.

Modifiers:
* onlyPool: Ensures certain functions can only be called by the associated lending pool.
* onlyDeadTranche: Restricts access to functions to only previous tranches.
* onlyOwnerOrPool: Limits function execution to the owner of the contract or the associated pool.

Integration with ERC4626:

The contract extends ERC4626Upgradeable, an ERC-4626-compliant vault standard for tokenized vaults. This allows the TrancheVault to represent staked assets with fungible tokens.

Deposit and Withdrawal Logic: The contract includes functions to enable or disable deposits (enableDeposits, disableDeposits) and withdrawals (enableWithdrawals, disableWithdrawals).

Asset Management: The contract handles asset transfers to and from the pool and manages the minting and burning of tranche tokens.

Rollover Process: The contract supports a rollover mechanism, where assets can be rolled over from a previous tranche to a new one. This includes approving rollovers, executing them, and burning old tranche tokens.

## Deployments

The deployment process involves two main contracts: Init deployment and Pool deployment.

InitProtocol
* Deploy Authority: Deploys an 'Authority' contract as a proxy, used to manage access control within the protocol.
* Deploy Pool Factory: Sets up a 'PoolFactory' contract, which is responsible for creating new lending pool instances.
* Deploy Fee Sharing Contract: Sets up a 'FeeSharing' contract to handle the distribution of fees to beneficiaries.
* Deploy Lending Pool Template: Deploys the contracts required for lending pools, such as 'PoolCalculations', 'PoolTransfers', and the lending pool itself, which will be cloned for each new pool.
* Deploy Tranche Vault: Deploys a 'TrancheVault' contract, which might be related to handling different tranches or slices of investment or debt.
* Transfer Ownership: Transfers the ownership of these contracts to a specified owner address (like a multisig wallet or a governance contract).

Pool
The Pool contract represents an individual lending pool. Each Pool contract is deployed by the PoolFactory and is initialized with a set of parameters that define its behavior. These parameters include details such as the pool's name, the token it uses, the addresses of the borrower and the platform's token, the minimum and maximum funding capacity, the funding and lending term durations, the interest rate, the repayment schedule, and the details of the tranches. Once deployed, the Pool contract manages the lending and repayment processes, and handles the distribution of interest and penalties.

## How to Deploy

To ensure comprehensive testing of the application, it's necessary to test the pool in all possible states. A pool can be in one of six states:

* Open: The pool is open for funding.
* Default: The borrower has defaulted on their loan.
* Delinquent: The borrower is late on their repayment.
* Borrowed: The funds have been borrowed and the loan is active.
* Repaid: The loan has been fully repaid.
* Underfunded: The pool did not reach its minimum funding capacity.

In addition to these states, a pool can be either a unitranche or a multitranche pool. A unitranche pool has a single tranche, while a multitranche pool has multiple tranches, each with its own interest rate and risk level.

To fully test the application in all possible pool states, you need to deploy 12 pools: 6 for unitranche (one for each state) and 6 for multitranche

This is an example of a Unitranche open pool deployment, to deploy a different replace with the the appropriate encoding script and set the --stage flag to the required value.

```
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-open.sh)" --stage open --network goerli  --pool-factory-address 0xAf03965261C17Bcf7DD63B5DDA548395F522161B
```

## QA pool deployments

You will find a bunch of scripts for QA pool deployments in `scripts/deployments/qa_pools/` folder
In order to deploy and recreate pools:

1. make sure `.env.goerli` file is populated with latest pool factory address, lending pool implementation and tranche vault implementation addressess.
2. run `npx hardhat run --network goerli scripts/deployments/qa_pools/001_funded_uni_pool.ts`
