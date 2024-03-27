#!/bin/bash

export USDC_ADDRESS_6="0xd9af0d725ABE1070e2010C421596d81810E4a633"
export BORROWER_ADDRESS="0x7F2AD66E5aA6768E6C74AA3F488Fe7b35276Aa2F"
export PLATFORM_TOKEN_ADDRESS="0x7660203Abd05FCabaBE812bFa87A6921BbeB3445"

npx hardhat encode-pool-initializer \
  --name "Working capital for LATAM SMEs" \
  --token "TPT-4" \
  --stable-coin-contract-address $USDC_ADDRESS_6 \
  --platform-token-contract-address $PLATFORM_TOKEN_ADDRESS \
  --min-funding-capacity 80000 \
  --max-funding-capacity 100000 \
  --funding-period-seconds 1 \
  --lending-term-seconds 1814400 \
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
