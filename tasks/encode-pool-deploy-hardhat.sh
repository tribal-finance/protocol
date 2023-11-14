#!/bin/bash

export USDC_ADDRESS_6="0x0b27a79cb9C0B38eE06Ca3d94DAA68e0Ed17F953"
export BORROWER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export PLATFORM_TOKEN_ADDRESS="0x0b27a79cb9C0B38eE06Ca3d94DAA68e0Ed17F953"

npx hardhat encode-pool-initializer \
  --name "Working capital for LATAM SMEs" \
  --token "TPT" \
  --stable-coin-contract-address $USDC_ADDRESS_6 \
  --platform-token-contract-address $PLATFORM_TOKEN_ADDRESS \
  --min-funding-capacity 80000 \
  --max-funding-capacity 100000 \
  --funding-period-seconds 2592000 \
  --lending-term-seconds 31557600 \
  --first-loss-assets 5000 \
  --repayment-recurrence-days 30 \
  --grace-period-days 5 \
  --borrower-total-interest-rate-wad 0.15 \
  --borrower-address $BORROWER_ADDRESS \
  --protocol-fee-wad 0.1 \
  --default-penalty 0.1 \
  --penalty-rate-wad 0.02 \
  --tranches-count 2 \
  --tranche-a-p-rs-wads "0.12,0.18" \
  --tranche-boosted-a-p-rs-wads "0.12,0.18" \
  --tranche-boost-ratios "2,2" \
  --tranche-coverages-wads "1,1" \
  --funding-split-wads "0.8,0.8:0.2,0.2"
