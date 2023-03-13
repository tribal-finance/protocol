# Tribal DEFI smart contracts

## Contracts description:
- `contracts/PoolFactory.sol` contract used for lending pool deployments. Uses OpenZeppelin clones to deploy efficient proxies pointing to the implementation.
- `contracts/LendingPool.sol` is lending pool. implements https://ethereum.org/en/developers/docs/standards/tokens/erc-4626/