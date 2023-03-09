import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import setupUSDC, { USDC_PRECISION } from "./helpers/usdc";

const { parseUnits } = ethers.utils;

describe("MainnetForkUSDC", function () {
  xit("gives 1,000,000 USDC to first signer", async function () {
    const { usdc, signerAddresses } = await loadFixture(setupUSDC);

    expect(await usdc.balanceOf(signerAddresses[0])).to.eq(
      parseUnits("1000000", USDC_PRECISION)
    );
  });

  xit("gives 1,000,000 USDC to second signer", async function () {
    const { usdc, signerAddresses } = await loadFixture(setupUSDC);

    expect(await usdc.balanceOf(signerAddresses[1])).to.eq(
      parseUnits("1", 6 + USDC_PRECISION)
    );
  });

  xit("gives 1,000,000 USDC to third signer too", async function () {
    const { usdc, signerAddresses } = await loadFixture(setupUSDC);

    expect(await usdc.balanceOf(signerAddresses[3])).to.eq(
      parseUnits("1", 6 + 6)
    );
  });
});
