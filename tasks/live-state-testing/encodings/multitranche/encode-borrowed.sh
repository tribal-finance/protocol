#!/bin/bash

export USDC_ADDRESS_6="0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
export BORROWER_ADDRESS="0x8DfA5E23c8bd7911ea7A31b180b1572B5858300B"
export PLATFORM_TOKEN_ADDRESS="0x0f81CdC8c06CF924B829E9FDA1f616fA716322F2"

npx hardhat encode-pool-initializer \
  --name "v1.0.3 BORROWED 2T" \
  --token "TST BORROWED" \
  --stable-coin-contract-address $USDC_ADDRESS_6 \
  --platform-token-contract-address $PLATFORM_TOKEN_ADDRESS \
  --min-funding-capacity 1000 \
  --max-funding-capacity 1200 \
  --funding-period-seconds 45 \
  --lending-term-seconds 1814400 \
  --first-loss-assets 200 \
  --repayment-recurrence-days 30 \
  --grace-period-days 5 \
  --borrower-total-interest-rate-wad 0.15 \
  --borrower-address $BORROWER_ADDRESS \
  --protocol-fee-wad 0.1 \
  --default-penalty 0.5 \
  --penalty-rate-wad 0.02 \
  --tranches-count 2 \
  --tranche-a-p-rs-wads "0.1,0.1" \
  --tranche-boosted-a-p-rs-wads "0.1,0.1" \
  --tranche-boost-ratios "2,2" \
  --tranche-coverages-wads "1,1" \
  --funding-split-wads "0.8,0.8:0.2,0.2"
