const STAGES = {
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
};

export default STAGES;

const flipped = Object.entries(STAGES).map(([key, value]) => [value, key]);
export const STAGES_LOOKUP = Object.fromEntries(flipped);
