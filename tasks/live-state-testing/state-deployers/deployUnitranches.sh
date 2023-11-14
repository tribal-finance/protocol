#!/bin/bash

npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-borrowed.sh)" --stage borrowed --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-defaulted.sh)" --stage defaulted --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-delinquent.sh)" --stage borrowed --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-flc-deposited.sh)" --stage flc_deposited --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-flc-withdrawn.sh)" --stage flc_withdrawn --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-funded.sh)" --stage funded --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-funding-failed.sh)" --stage funding_failed --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-open.sh)" --stage open --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/unitranche/encode-repaid.sh)" --stage repaid --network goerli    