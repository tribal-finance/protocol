import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-contract-sizer";
import "hardhat-docgen";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
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
      url: `https://eth-goerli.alchemyapi.io/v2/${process.env.GOERLI_ALCHEMY_API_KEY}`,
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
    runOnCompile: true,
  },
};

export default config;
