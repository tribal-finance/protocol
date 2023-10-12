#!/bin/bash

export USDC_ADDRESS_6="0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
export BORROWER_ADDRESS="0x8DfA5E23c8bd7911ea7A31b180b1572B5858300B"
export PLATFORM_TOKEN_ADDRESS="0x0f81CdC8c06CF924B829E9FDA1f616fA716322F2"

npx hardhat encode-pool-initializer \
  --name "v1.0.3 FLC_DEPOSITED 5T" \
  --token "TST FLC_DEPOSITED" \
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
  --tranches-count 5 \
  --tranche-a-p-rs-wads "0.1,0.1,0.2,0.3,.66" \
  --tranche-boosted-a-p-rs-wads "0.1,0.1,0.2,0.3,.99" \
  --tranche-boost-ratios "2,2,3,4,3.2" \
  --tranche-coverages-wads "1,1,1,0.4,.069" \
  --funding-split-wads "0.65,0.65:0.185,0.185:0.1,0.1:0.05,0.05:0.015,0.015"
