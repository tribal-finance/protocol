#!/bin/bash

npx hardhat prod-init-protocol \
  --stable-coin-address "0xd9af0d725ABE1070e2010C421596d81810E4a633" \
  --fee-sharing-beneficiaries "0xCF41cd5403956BebE00EC60a3F762b10E9b08035,0x5aAA8d018CcFee542e4dAD3B00343bE4BeFb069E" \
  --fee-sharing-beneficiaries-shares-wad "0.2,0.8" \
  --owner "0x5aAA8d018CcFee542e4dAD3B00343bE4BeFb069E" \
  --network sepolia

