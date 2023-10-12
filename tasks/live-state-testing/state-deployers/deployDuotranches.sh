#!/bin/bash

npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-borrowed.sh)" --stage borrowed --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-defaulted.sh)" --stage defaulted --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-delinquent.sh)" --stage borrowed --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-flc-deposited.sh)" --stage flc_deposited --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-flc-withdrawn.sh)" --stage flc_withdrawn --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-funded.sh)" --stage funded --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-funding-failed.sh)" --stage funding_failed --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-open.sh)" --stage open --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/duotranche/encode-repaid.sh)" --stage repaid --network goerli    