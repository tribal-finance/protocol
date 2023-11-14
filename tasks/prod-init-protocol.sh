#!/bin/bash

npx hardhat prod-init-protocol \
  --stable-coin-address "0x07865c6E87B9F70255377e024ace6630C1Eaa37F" \
  --fee-sharing-beneficiaries "0x92Cc142779cbA7E496cd7C724F41d6e71EffFfeF,0xCA2227dE8601baF9887083abc1FAf97558B8D382" \
  --fee-sharing-beneficiaries-shares-wad "0.2,0.8" \
  --owner "0xCF41cd5403956BebE00EC60a3F762b10E9b08035" \
  --network goerli

