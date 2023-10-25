#!/bin/bash

npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-borrowed.sh)" --stage borrowed --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-defaulted.sh)" --stage defaulted --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-delinquent.sh)" --stage borrowed --network goerli    
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-initial.sh)" --stage open --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-open.sh)" --stage open --network goerli
npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-repaid.sh)" --stage repaid --network goerli    