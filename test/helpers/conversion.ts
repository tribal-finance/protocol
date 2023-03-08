import { utils } from "ethers";
const { parseUnits } = utils;

export const WAD_PRECISION = 18;
export const USDC_PRECISION = 6;

export const WAD = (amount: string | number) =>
  parseUnits(amount.toString(), WAD_PRECISION);
export const USDC = (amount: string | number) =>
  parseUnits(amount.toString(), USDC_PRECISION);
