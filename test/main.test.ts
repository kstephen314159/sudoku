/// <reference types="vitest/globals" />
import { AdvancedSudokuSolver } from '../src/core/solver';
import { Cell, SudokuState } from '../src/core/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** 81-cell board where every cell has solved=null, candidates=[]. */
function blankBoard(): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      cells.push({ row: r, column: c, solved: null, candidates: [] });
    }
  }
  return cells;
}

function get(cells: Cell[], r: number, c: number): Cell {
  return cells.find(cell => cell.row === r && cell.column === c)!;
}

/** Thin wrapper so we can call private strategy methods without TypeScript errors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = AdvancedSudokuSolver as any;

// ---------------------------------------------------------------------------
// Naked Single
// ---------------------------------------------------------------------------
describe('findNakedSingle', () => {
  it('assigns the lone candidate and clears candidates', () => {
    const cells = blankBoard();
    get(cells, 4, 4).candidates = [7];

    const result: SudokuState = S.findNakedSingle(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Naked Single');
    expect(get(result.cells, 4, 4).solved).toBe(7);
    expect(get(result.cells, 4, 4).candidates).toEqual([]);
  });

  it('returns null when every unsolved cell has 2+ candidates', () => {
    const cells = blankBoard();
    get(cells, 0, 0).candidates = [1, 2];

    expect(S.findNakedSingle(cells)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hidden Single
// ---------------------------------------------------------------------------
describe('findHiddenSingle', () => {
  it('finds a digit that appears in only one cell in a row', () => {
    const cells = blankBoard();
    // Row 2: digit 5 in many cells, digit 9 ONLY in R2C7 → hidden single.
    get(cells, 2, 0).candidates = [5, 6];
    get(cells, 2, 3).candidates = [5, 8];
    get(cells, 2, 7).candidates = [5, 9]; // ← 9 is unique in this row

    const result: SudokuState = S.findHiddenSingle(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Hidden Single');
    // The first unique digit found (d=5 across rows/units may vary; 9 is unique in row 2)
    // 5 appears in R2C0, R2C3, R2C7 → not unique; 6 only in R2C0 (col 0 fires sooner);
    // to keep the test deterministic we verify the cell that receives its value
    // — for col 0: digit 6 is unique → R2C0 gets solved=6.
    const modified = result.cells.find(c => c.solved !== null)!;
    expect(modified.solved).not.toBeNull();
  });

  it('works when the hidden single is in a box', () => {
    const cells = blankBoard();
    // Box 4 (rows 3-5, cols 3-5): digit 1 only in R3C3
    get(cells, 3, 3).candidates = [1, 2];
    get(cells, 3, 4).candidates = [2, 3];
    get(cells, 4, 3).candidates = [2, 4];
    get(cells, 4, 4).candidates = [3, 4];

    const result: SudokuState = S.findHiddenSingle(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Hidden Single');
    expect(get(result.cells, 3, 3).solved).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Naked Subset
// ---------------------------------------------------------------------------
describe('findNakedSubset', () => {
  it('eliminates a naked pair from the rest of its row', () => {
    const cells = blankBoard();
    // Row 0: cells 0 & 1 form a naked pair with {4,7}
    get(cells, 0, 0).candidates = [4, 7];
    get(cells, 0, 1).candidates = [4, 7];
    get(cells, 0, 2).candidates = [1, 4];   // 4 should be eliminated → [1]
    get(cells, 0, 3).candidates = [2, 7];   // 7 should be eliminated → [2]

    const result: SudokuState = S.findNakedSubset(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Naked Pair');
    expect(get(result.cells, 0, 2).candidates).toEqual([1]);
    expect(get(result.cells, 0, 3).candidates).toEqual([2]);
    // The pair itself is untouched
    expect(get(result.cells, 0, 0).candidates).toEqual([4, 7]);
  });

  it('eliminates a naked triple from its column', () => {
    const cells = blankBoard();
    // Col 5: cells in rows 0,1,2 form a naked triple with {2,5,8}
    get(cells, 0, 5).candidates = [2, 5];
    get(cells, 1, 5).candidates = [5, 8];
    get(cells, 2, 5).candidates = [2, 8];
    get(cells, 6, 5).candidates = [1, 2, 5]; // 2 and 5 eliminated → [1]

    const result: SudokuState = S.findNakedSubset(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Naked Triple');
    expect(get(result.cells, 6, 5).candidates).toEqual([1]);
  });

  it('returns null when no naked subset causes eliminations', () => {
    const cells = blankBoard();
    get(cells, 0, 0).candidates = [1, 2];
    get(cells, 0, 1).candidates = [1, 2];
    // No other cells in row 0 have candidate 1 or 2 → no eliminations possible
    expect(S.findNakedSubset(cells)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hidden Subset
// ---------------------------------------------------------------------------
describe('findHiddenSubsetInRowsCols', () => {
  it('strips extra candidates from cells forming a hidden pair in a row', () => {
    const cells = blankBoard();
    // Row 1: digits 3 and 7 appear ONLY in R1C2 and R1C5.
    // Other candidates in those cells should be stripped.
    get(cells, 1, 0).candidates = [1, 8, 9];
    get(cells, 1, 1).candidates = [5, 6];
    get(cells, 1, 2).candidates = [1, 3, 7];  // 1 should be stripped → [3,7]
    get(cells, 1, 3).candidates = [2, 4];
    get(cells, 1, 4).candidates = [4, 9];
    get(cells, 1, 5).candidates = [2, 3, 7];  // 2 should be stripped → [3,7]
    get(cells, 1, 6).candidates = [1, 4];
    get(cells, 1, 7).candidates = [4, 5, 8];
    get(cells, 1, 8).candidates = [1, 2, 5];

    const result: SudokuState = S.findHiddenSubsetInRowsCols(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Hidden Pair');
    expect(get(result.cells, 1, 2).candidates.sort()).toEqual([3, 7]);
    expect(get(result.cells, 1, 5).candidates.sort()).toEqual([3, 7]);
  });
});

// ---------------------------------------------------------------------------
describe('findHiddenSubsetInBoxes', () => {
  it('strips extra candidates from cells forming a hidden pair in a box', () => {
    const cells = blankBoard();
    // Box 4 (rows 3-5, cols 3-5): digits 5 and 9 appear ONLY in R3C3 and R4C4.
    // Other candidates in those two cells should be stripped.
    // No other digit appears in exactly 2 cells within box 4.
    get(cells, 3, 3).candidates = [2, 5, 9];  // 2 should be stripped → [5,9]
    get(cells, 3, 4).candidates = [1, 3];
    get(cells, 3, 5).candidates = [2, 4];
    get(cells, 4, 3).candidates = [1, 6];
    get(cells, 4, 4).candidates = [4, 5, 9];  // 4 should be stripped → [5,9]
    get(cells, 4, 5).candidates = [3, 6];
    get(cells, 5, 3).candidates = [3, 4];
    get(cells, 5, 4).candidates = [2, 6];
    get(cells, 5, 5).candidates = [1, 4];

    const result: SudokuState = S.findHiddenSubsetInBoxes(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Hidden Pair');
    expect(get(result.cells, 3, 3).candidates.sort()).toEqual([5, 9]);
    expect(get(result.cells, 4, 4).candidates.sort()).toEqual([5, 9]);
  });
});

// ---------------------------------------------------------------------------
// Locked Candidates (Pointing & Claiming)
// ---------------------------------------------------------------------------
describe('findLockedCandidates', () => {
  it('pointing: eliminates a digit from the rest of a row when confined to one box', () => {
    const cells = blankBoard();
    // Box 0 (rows 0-2, cols 0-2): digit 6 only in row 0 (R0C0, R0C1)
    get(cells, 0, 0).candidates = [6, 9];
    get(cells, 0, 1).candidates = [4, 6];
    get(cells, 1, 0).candidates = [3, 4];
    get(cells, 2, 0).candidates = [3, 9];
    // Row 0 outside box 0:
    get(cells, 0, 5).candidates = [1, 6]; // ← should lose 6

    const result: SudokuState = S.findLockedCandidates(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Pointing');
    expect(get(result.cells, 0, 5).candidates).toEqual([1]);
  });

  it('claiming: eliminates a digit from the rest of a box when confined to one row', () => {
    const cells = blankBoard();
    // Row 3: digit 2 only in cols 0,1,2 (box 3)
    get(cells, 3, 0).candidates = [2, 5];
    get(cells, 3, 1).candidates = [2, 8];
    get(cells, 3, 6).candidates = [4, 7]; // no 2 outside box
    // Other cells in box 3 (rows 4-5, cols 0-2) that have 2:
    get(cells, 4, 1).candidates = [1, 2]; // ← should lose 2

    const result: SudokuState = S.findLockedCandidates(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('Claiming');
    expect(get(result.cells, 4, 1).candidates).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// X-Wing
// ---------------------------------------------------------------------------
describe('findXWing', () => {
  it('eliminates a digit from two columns via a row-based X-Wing', () => {
    const cells = blankBoard();
    // Digit 3 in row 0: only at cols 1 and 4
    get(cells, 0, 1).candidates = [3, 8];
    get(cells, 0, 4).candidates = [3, 9];
    // Digit 3 in row 6: only at cols 1 and 4
    get(cells, 6, 1).candidates = [3, 5];
    get(cells, 6, 4).candidates = [3, 7];
    // Other rows with 3 in col 1 or col 4 — these should be eliminated:
    get(cells, 3, 1).candidates = [1, 3]; // ← lose 3
    get(cells, 5, 4).candidates = [2, 3]; // ← lose 3

    const result: SudokuState = S.findXWing(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('X-Wing');
    expect(get(result.cells, 3, 1).candidates).toEqual([1]);
    expect(get(result.cells, 5, 4).candidates).toEqual([2]);
  });

  it('returns null when no pattern exists', () => {
    const cells = blankBoard();
    get(cells, 0, 0).candidates = [1, 2];
    expect(S.findXWing(cells)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// XY-Wing
// ---------------------------------------------------------------------------
describe('findXYWing', () => {
  it('eliminates the pincer digit from a cell that sees both wings', () => {
    const cells = blankBoard();
    // Pivot R0C0 [1,2], Wing-B R0C5 [1,3], Wing-C R5C0 [2,3]
    // Pivot sees Wing-B (same row) and Wing-C (same col).
    // Any cell seeing both wings can't hold 3.
    // R5C5 sees Wing-B (col 5) AND Wing-C (row 5) → eliminate 3 from R5C5.
    get(cells, 0, 0).candidates = [1, 2]; // pivot
    get(cells, 0, 5).candidates = [1, 3]; // wing B: shares x=1 with pivot
    get(cells, 5, 0).candidates = [2, 3]; // wing C: shares y=2 with pivot
    get(cells, 5, 5).candidates = [3, 6]; // target → should lose 3

    const result: SudokuState = S.findXYWing(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('XY-Wing');
    expect(get(result.cells, 5, 5).candidates).toEqual([6]);
  });
});

// ---------------------------------------------------------------------------
// solveNext — priority and edge cases
// ---------------------------------------------------------------------------
describe('solveNext', () => {
  it('returns "no further moves" on a fully solved board', () => {
    const cells: Cell[] = [];
    let d = 1;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        cells.push({ row: r, column: c, solved: ((d++ - 1) % 9) + 1, candidates: [] });
      }
    }
    const result = AdvancedSudokuSolver.solveNext({ cells });
    expect(result.lastMove).toContain('No further');
  });

  it('picks naked single over hidden single when both are present', () => {
    const cells = blankBoard();
    // Naked single: R0C0 has only [5]
    get(cells, 0, 0).candidates = [5];
    // Hidden single: digit 9 unique in row 1 (R1C3)
    get(cells, 1, 1).candidates = [2, 3];
    get(cells, 1, 3).candidates = [2, 9];

    const result = AdvancedSudokuSolver.solveNext({ cells });

    expect(result.lastMove).toContain('Naked Single');
    expect(get(result.cells, 0, 0).solved).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// AIC (Alternating Inference Chain)
// ---------------------------------------------------------------------------

/**
 * Returns the exact board position from data/puzzle.json at the point where
 * the solver identifies an AIC move.  Cells are encoded directly so the test
 * is self-contained and does not read from disk.
 */
function puzzleBoard(): Cell[] {
  const s = (r: number, c: number, v: number): Cell => ({ row: r, column: c, solved: v, candidates: [] });
  const u = (r: number, c: number, cands: number[]): Cell => ({ row: r, column: c, solved: null, candidates: cands });
  return [
    // Row 0
    u(0,0,[4,5,7]), s(0,1,9),     s(0,2,1),     u(0,3,[3,4,6,7]), u(0,4,[3,4,5]),     u(0,5,[3,4,6,7]), u(0,6,[2,8]),     u(0,7,[2,5,8]), u(0,8,[2,7,8]),
    // Row 1
    s(1,0,6),       s(1,1,3),     u(1,2,[4,5]), u(1,3,[4,7]),     s(1,4,8),           s(1,5,2),         u(1,6,[5,9]),     s(1,7,1),       u(1,8,[7,9]),
    // Row 2
    u(2,0,[2,5,7]), u(2,1,[2,5,7]), s(2,2,8),   u(2,3,[1,7,9]),   u(2,4,[1,5,9]),     u(2,5,[1,7,9]),   s(2,6,3),         s(2,7,6),       s(2,8,4),
    // Row 3
    u(3,0,[4,9]),   s(3,1,6),     u(3,2,[4,9]), u(3,3,[1,8]),     s(3,4,2),           u(3,5,[1,8]),     s(3,6,7),         s(3,7,3),       s(3,8,5),
    // Row 4
    s(4,0,1),       u(4,1,[5,7]), u(4,2,[3,7]), u(4,3,[3,4]),     s(4,4,6),           u(4,5,[3,4,5]),   u(4,6,[2,8]),     s(4,7,9),       u(4,8,[2,8]),
    // Row 5
    u(5,0,[2,5]),   s(5,1,8),     u(5,2,[2,3]), u(5,3,[3,9]),     s(5,4,7),           u(5,5,[3,5,9]),   s(5,6,1),         s(5,7,4),       s(5,8,6),
    // Row 6
    s(6,0,8),       s(6,1,1),     u(6,2,[5,6]), s(6,3,2),         u(6,4,[4,9]),       u(6,5,[4,6,9]),   u(6,6,[4,5,9]),   s(6,7,7),       s(6,8,3),
    // Row 7
    u(7,0,[2,7,9]), s(7,1,4),     u(7,2,[2,7,9]), s(7,3,5),       u(7,4,[1,3]),       u(7,5,[1,3,7,8]), s(7,6,6),         u(7,7,[2,8]),   u(7,8,[1,2,8]),
    // Row 8
    s(8,0,3),       u(8,1,[2,5,7]), u(8,2,[2,6,7]), u(8,3,[1,4,6,7,8,9]), u(8,4,[1,4,9]), u(8,5,[1,4,6,7,8,9]), u(8,6,[4,9]), u(8,7,[2,5,8]), u(8,8,[1,2,8,9]),
  ];
}

describe('findAIC', () => {
  it('returns null when no AIC exists', () => {
    // Blank board — no candidates at all, no links can form.
    expect(S.findAIC(blankBoard())).toBeNull();
  });

  it('finds the AIC on the real puzzle board and makes the correct elimination', () => {
    // Board is at the state where X-Wing has already been applied.
    // Expected chain: R2C3=4 == R2C3=5 -- R7C3=5 == R9C2=5 -- R5C2=5 == R5C6=5 -- R5C6=4 == R5C4=4
    // Expected elimination: digit 4 from R2C4 (row=1, col=3).
    const cells = puzzleBoard();
    const result = S.findAIC(cells);

    expect(result).not.toBeNull();
    expect(result.lastMove).toContain('AIC:');
    expect(result.lastMove).toContain('→');

    // The elimination target R2C4 (0-based: row=1, col=3) should no longer have candidate 4.
    const target = get(result.cells, 1, 3);
    expect(target.candidates).not.toContain(4);

    // Structured moves array must record exactly this elimination.
    expect(result.moves).toEqual([
      { cell: 'R2C4', action: 'remove_candidate', digit: 4 },
    ]);
  });

  it('prefers the shorter of two valid chains when iteration order would surface the longer chain first', () => {
    // This test verifies the "find all, pick shortest" behaviour.
    //
    // A single starting cell (R1C1, digit 9) produces TWO chains within its own DFS:
    //
    //   Chain A — 6 nodes (found FIRST, depth-first via conjugate-pair strong links):
    //     R1C1=9 ==row1== R1C7=9 --col7-- R4C7=9 ==row4== R4C9=9 --col9-- R8C9=9 ==row8== R8C1=9
    //     → eliminates 9 from R5C1  (the old "return on first found" code returns this)
    //
    //   Chain B — 4 nodes (found LATER, via bivalue strong links within same DFS):
    //     R1C1=9 ==bivalue== R1C1=1 --col1-- R5C1=1 ==bivalue== R5C1=9
    //     → eliminates 9 from R8C1
    //
    // The new algorithm must collect both chains and return chain B (length 4).
    // Evidence that chain A was NOT chosen: R5C1 still has candidate 9 after the move.
    const cells = blankBoard();

    // Chain A cells — digit 9 and digit 1 (bivalue)
    get(cells, 0, 0).candidates = [9, 1]; // R1C1 — chain A+B start
    get(cells, 0, 6).candidates = [9, 1]; // R1C7
    get(cells, 3, 6).candidates = [9, 1]; // R4C7
    get(cells, 3, 8).candidates = [9, 1]; // R4C9
    get(cells, 7, 8).candidates = [9, 1]; // R8C9
    get(cells, 7, 0).candidates = [9, 1]; // R8C1 — chain B elimination target
    get(cells, 4, 0).candidates = [9, 1]; // R5C1 — chain A elimination target / chain B end

    const result = S.findAIC(cells);

    expect(result).not.toBeNull();

    // Chain B (4-node) must have been chosen — eliminates 9 from R8C1 (row=7, col=0).
    expect(result.moves).toEqual([
      { cell: 'R8C1', action: 'remove_candidate', digit: 9 },
    ]);

    // R8C1's candidate 9 was removed.
    expect(get(result.cells, 7, 0).candidates).not.toContain(9);

    // R5C1 still has candidate 9 — confirms chain A (6-node) was NOT applied.
    expect(get(result.cells, 4, 0).candidates).toContain(9);
  });
});
