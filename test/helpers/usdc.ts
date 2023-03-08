import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

const { parseUnits } = ethers.utils;

export const USDC_ADDRESS_6 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const USDC_PRECISION = 6;

/**
 * HIJACKS USDC smart contract proxy and mints 1.000.000 USDC to
 * first 5 signers
 *
 * @returns usdc          usdc contract
 * @returns signers       signers list
 * @returns signerAddress signer addresses
 */
export default async function testSetup() {
  const usdc = await ethers.getContractAt("ITestUSDC", USDC_ADDRESS_6);
  const signers = await ethers.getSigners();
  const [signer] = signers;
  const signerAddress = await signer.getAddress();

  const signerAddresses = await Promise.all(signers.map((s) => s.getAddress()));

  const value = ethers.utils.hexlify(ethers.utils.zeroPad(signerAddress, 32));

  // set contract owner to first signer
  await ethers.provider.send("hardhat_setStorageAt", [
    USDC_ADDRESS_6,
    "0x0",
    value,
  ]);

  // set master minter to first signer
  await usdc.updateMasterMinter(signerAddress);

  await usdc.configureMinter(
    signerAddress,
    parseUnits("1", 9 + USDC_PRECISION)
  );

  for (let i = 0; i < 5; i++) {
    await usdc.mint(
      await signerAddresses[i],
      parseUnits("1", 6 + USDC_PRECISION)
    );
  }

  return { usdc, signers, signerAddresses };
}
