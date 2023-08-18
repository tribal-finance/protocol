const STAGES:  { [key: string]: number } = {
  INITIAL: 0,
  OPEN: 1,
  FUNDED: 2,
  FUNDING_FAILED: 3,
  FLC_DEPOSITED: 4,
  BORROWED: 5,
  BORROWER_INTEREST_REPAID: 6,
  DILINQUENT: 7,
  REPAID: 8,
  DEFAULTED: 9,
  FLC_WITHDRAWN: 10,
};

const STATE_MACHINE = [
  [0, 4],
  [4, 1],
  [1, 2],
  [1, 3],
  [2, 5],
  [5, 8],
  [8, 10],
  [5, 9]
]

export default STAGES;

const flipped = Object.entries(STAGES).map(([key, value]) => [value, key]);
export const STAGES_LOOKUP = Object.fromEntries(flipped);

const stringify = Object.entries(STAGES).map(([key, value]) => [key.toString(), value.toString()]);
export const STAGES_LOOKUP_STR:  { [key: string]: string }  = Object.fromEntries(stringify);
