# Tribal DEFI smart contracts

## Contracts description (mentioned in the order of their deployment):
- `contracts/authority` - authority smart contract containing whitelists of admins, lenders and borrowers.
- `contracts/staking` - PLATFORM token staking smart contract (stake PLATFORM, get USDC).
- `contracts/fee_sharing` - A contract that shares fees earned by the pool between staking and the foundation.
- `contracts/vaults` - ERC-4626 vault for lending pool tranches.
- `contracts/pool` - MAIN lending pool contract. Deploys logic of the pool.
- `contracts/factory` - PoolFactory used to deploy various pools.

## QA pool deployments

You will find a bunch of scripts for QA pool deployments in `scripts/deployments/qa_pools/` folder
In order to deploy and recreate pools:

1. make sure `.env.goerli` file is populated with latest pool factory address, lending pool implementation and tranche vault implementation addressess.
2. run `npx hardhat run --network goerli scripts/deployments/qa_pools/001_funded_uni_pool.ts`
