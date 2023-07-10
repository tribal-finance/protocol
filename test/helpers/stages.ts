const STAGES = {
  INITIAL: 0,
  OPEN: 1,
  FUNDED: 2,
  FUNDING_FAILED: 3,
  FLC_DEPOSITED: 4,
  BORROWED: 5,
  REPAID: 6,
  DEFAULTED: 7,
  FLC_WITHDRAWN: 8,
};

export default STAGES;

const flipped = Object.entries(STAGES).map(([key, value]) => [value, key]);
export const STAGES_LOOKUP = Object.fromEntries(flipped);
