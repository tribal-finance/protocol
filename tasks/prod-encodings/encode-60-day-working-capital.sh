#!/bin/bash

export USDC_ADDRESS_6="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
export BORROWER_ADDRESS="0xb748289127A08AFe00948594Bf431FF138C9e9d4"
export PLATFORM_TOKEN_ADDRESS="0x2B3a2582fd8a1419c394b351111a955AB6fa78D6"

npx hardhat encode-pool-initializer \
  --name "60 Day Working Capital" \
  --token "TPT" \
  --stable-coin-contract-address $USDC_ADDRESS_6 \
  --platform-token-contract-address $PLATFORM_TOKEN_ADDRESS \
  --min-funding-capacity 80000 \
  --max-funding-capacity 100000 \
  --funding-period-seconds 134324 \
  --lending-term-seconds 5184000 \
  --first-loss-assets 10000 \
  --repayment-recurrence-days 30 \
  --grace-period-days 5 \
  --borrower-total-interest-rate-wad 0.14 \
  --borrower-address $BORROWER_ADDRESS \
  --protocol-fee-wad 0.1 \
  --default-penalty 0.1 \
  --penalty-rate-wad 0.02 \
  --tranches-count 2 \
  --tranche-a-p-rs-wads "0.14" \
  --tranche-boosted-a-p-rs-wads "0.14" \
  --tranche-boost-ratios "2" \
  --tranche-coverages-wads "1" \
  --funding-split-wads "1,1"
