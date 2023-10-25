#!/bin/bash

npx hardhat set-pool-state --lending-pool-params "$(./tasks/live-state-testing/encodings/demotranche/encode-demo.sh)" --stage open --network goerli