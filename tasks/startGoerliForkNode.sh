#!/bin/bash

# Start Hardhat Network in the background
npx hardhat node &

# Wait for a few seconds to ensure the node is running
sleep 5

# Run the Hardhat task
npx hardhat goerli