#!/bin/bash

export BORROWER_ADDRESS="0x7F2AD66E5aA6768E6C74AA3F488Fe7b35276Aa2F"

npx hardhat init-protocol \
  --stable-coin-address "0xd9af0d725ABE1070e2010C421596d81810E4a633" \
  --foundation-address "0x5aAA8d018CcFee542e4dAD3B00343bE4BeFb069E" \
  --lending-pool-params "$(./tasks/encode-pool-deploy-testnet.sh)" \
  --fee-sharing-beneficiaries "0x5aAA8d018CcFee542e4dAD3B00343bE4BeFb069E,0xCF41cd5403956BebE00EC60a3F762b10E9b08035" \
  --fee-sharing-beneficiaries-shares-wad "0.2,0.8" \
  --owner "0xCF41cd5403956BebE00EC60a3F762b10E9b08035" \
  --borrower $BORROWER_ADDRESS \
  --network sepolia

