#!/bin/bash

export BORROWER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

npx hardhat init-protocol \
  --stable-coin-address "0x0b27a79cb9C0B38eE06Ca3d94DAA68e0Ed17F953" \
  --foundation-address "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" \
  --lending-pool-params "$(./tasks/encode-pool-deploy-hardhat.sh)" \
  --fee-sharing-beneficiaries "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0x70997970C51812dc3A010C7d01b50e0d17dc79C8" \
  --fee-sharing-beneficiaries-shares-wad "0.2,0.8" \
  --owner "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" \
  --borrower $BORROWER_ADDRESS \
  --network hardhat

