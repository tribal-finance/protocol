#!/bin/bash

# Define the values of the parameters as environment variables
export USDC_ADDRESS_6="0x1234567890123456789012345678901234567890"
export BORROWER_ADDRESS="0x1234567890123456789012345678901234567890"
export PLATFORM_TOKEN_ADDRESS="0x1234567890123456789012345678901234567890"

npx hardhat encode-pool-initializer \
  --name "Test Pool" \
  --token "TST" \
  --stable-coin-contract-address $USDC_ADDRESS_6 \
  --platform-token-contract-address $PLATFORM_TOKEN_ADDRESS \
  --min-funding-capacity 10000 \
  --max-funding-capacity 12000 \
  --funding-period-seconds 86400 \
  --lending-term-seconds 15768000 \
  --first-loss-assets 2000 \
  --repayment-recurrence-days 30 \
  --grace-period-days 5 \
  --borrower-total-interest-rate-wad 0.15 \
  --borrower-address $BORROWER_ADDRESS \
  --protocol-fee-wad 0.1 \
  --default-penalty 0 \
  --penalty-rate-wad 0.02 \
  --tranches-count 2 \
  --tranche-a-p-rs-wads "0.1,0.1" \
  --tranche-boosted-a-p-rs-wads "0.1,0.1" \
  --tranche-boost-ratios "2,2" \
  --tranche-coverages-wads "1,1" \
  --funding-split-wads "0.8,0.2"
