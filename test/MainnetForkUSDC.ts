import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const { parseUnits } = ethers.utils;

const USDC_ADDRESS_6 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDC_WHALE_ADDRESS = "0xF977814e90dA44bFA03b6295A0616a897441aceC"; // Binance. Has 3kkk USDC;

describe("MainnetForkUSDC", function () {
  async function testSetup() {
    const usdc = await ethers.getContractAt("IUSDC", USDC_ADDRESS_6);
    const [signer] = await ethers.getSigners();
    const signerAddress = await signer.getAddress();
    const value = ethers.utils.hexlify(ethers.utils.zeroPad(signerAddress, 32));

    // set contract owner to first signer
    await ethers.provider.send("hardhat_setStorageAt", [
      USDC_ADDRESS_6,
      "0x0",
      value,
    ]);

    // set master minter to first signer
    await usdc.updateMasterMinter(await signer.getAddress());

    await usdc.configureMinter(
      await signer.getAddress(),
      parseUnits("1", 9 + 6)
    );

    await usdc.mint(await signer.getAddress(), parseUnits("1", 6 + 6));

    return { usdc, signer };
  }

  it("works", async function () {
    const { usdc, signer } = await loadFixture(testSetup);
    expect(await usdc.balanceOf(await signer.getAddress())).to.eq(
      parseUnits("1", 6 + 6)
    );
  });
});
