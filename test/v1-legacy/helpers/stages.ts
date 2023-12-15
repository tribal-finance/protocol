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

export type Transition = [number, number];

export const STATE_MACHINE: Transition[] = [
  [0, 4],    // INITIAL -> FLC_DEPOSITED
  [4, 1],    // FLC_DEPOSITED -> OPEN
  [1, 2],    // OPEN -> FUNDED
  [1, 3],    // OPEN -> FUNDING_FAILED
  [5, 8],    // BORROWED -> REPAID
  [5, 9],    // BORROWED -> DEFAULTED
  [2, 5],    // FUNDED -> BORROWED
  [8, 10],   // REPAID -> FLC_WITHDRAWN
];

export function isValidTransition(state1: number, state2: number): boolean {
  return STATE_MACHINE.some(transition => transition[0] === state1 && transition[1] === state2);
}

// breadth-first-search
export function findPath(initialState: number, targetState: number): Transition[] | null {
  const visited: Set<number> = new Set();
  const queue: { state: number, path: Transition[] }[] = [{ state: initialState, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    visited.add(current.state);

    for (const transition of STATE_MACHINE) {
      if (transition[0] === current.state && !visited.has(transition[1])) {
        const newPath = [...current.path, transition];

        if (transition[1] === targetState) {
          return newPath;
        }

        queue.push({ state: transition[1], path: newPath });
      }
    }
  }

  return null;
}

export default STAGES;

export function transitionToString(transition: Transition): string {
  return `${transition[0]}->${transition[1]}`;
}

const flipped = Object.entries(STAGES).map(([key, value]) => [value, key]);
export const STAGES_LOOKUP = Object.fromEntries(flipped);

const stringify = Object.entries(STAGES).map(([key, value]) => [key.toString(), value.toString()]);
export const STAGES_LOOKUP_STR:  { [key: string]: string }  = Object.fromEntries(stringify);

export function transitionsToString(transitions: Transition[]): string[] {
  return transitions.map(transition => `${STAGES_LOOKUP[transition[0]]} -> ${STAGES_LOOKUP[transition[1]]}`);
}
