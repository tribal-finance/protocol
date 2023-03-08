import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.18",
  networks: {
    hardhat: {
      forking: {
        enabled: true,
        url: process.env.MAINNET_FORK_ALCHEMY_URL!,
        blockNumber: 16782120,
      },
      chainId: 1,
    },
  },
};

export default config;
