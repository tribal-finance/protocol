# Tribal DEFI smart contracts

## Contracts description (mentioned in the order of their deployment):
- `contracts/authority` - authority smart contract containing whitelists of admins, lenders and borrowers.
- `contracts/staking` - TRIBL token staking smart contract (stake TRIBL, get USDC).
- `contracts/fee_sharing` - A contract that shares fees earned by the pool between staking and the foundation.
- `contracts/vaults` - ERC-4626 vault for lending pool tranches.
- `contracts/pool` - MAIN lending pool contract. Deploys logic of the pool.
- `contracts/factory` - PoolFactory used to deploy various pools.


## Getting Started

### Configure env
Copy `.env.shared.example` into using `.env.shared` and fill in variables

### List Scripts available to run
```$ npm run```


### Install 
```$ yarn install``` 

### Test
``` $ npm test```

### Test Coverage
``` $ npm run test-coverage```