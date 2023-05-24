import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-contract-sizer";
import "hardhat-docgen";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { network } from "hardhat";

dotenv.config({ path: `./.env.shared` });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10,
      },
    },
  },

  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: process.env.MAINNET_FORK_ALCHEMY_URL!,
        blockNumber: 16782120,
      },
      chainId: 1,
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 5,
      accounts: [
        process.env.GOERLI_DEPLOYER_KEY!,
        process.env.GOERLI_LENDER1_KEY!,
        process.env.GOERLI_LENDER2_KEY!,
        process.env.GOERLI_BORROWER_KEY!,
      ],
    },
    staging: {
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 5,
      accounts: [
        process.env.GOERLI_DEPLOYER_KEY!,
        process.env.GOERLI_LENDER1_KEY!,
        process.env.GOERLI_LENDER2_KEY!,
        process.env.GOERLI_BORROWER_KEY!,
      ],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  docgen: {
    path: "./docs",
    clear: true,
    runOnCompile: false,
  },
};

export default config;
