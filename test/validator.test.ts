/// <reference types="vitest/globals" />
import { Cell } from '../src/types';
import { SudokuValidator, ValidationError } from '../src/validator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fully unsolved 9×9 board with empty candidate lists. */
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

function codes(errors: ValidationError[]): string[] {
  return errors.map(e => e.code);
}

// ---------------------------------------------------------------------------
// WRONG_CELL_COUNT
// ---------------------------------------------------------------------------
describe('WRONG_CELL_COUNT', () => {
  it('reports an error and returns early when fewer than 81 cells are supplied', () => {
    const cells = blankBoard().slice(0, 80);
    const errors = SudokuValidator.validate(cells);

    expect(codes(errors)).toContain('WRONG_CELL_COUNT');
    // Should bail early — no further checks should run
    expect(errors).toHaveLength(1);
  });

  it('reports an error when more than 81 cells are supplied', () => {
    const cells = blankBoard();
    cells.push({ row: 0, column: 0, solved: null, candidates: [] });
    const errors = SudokuValidator.validate(cells);

    expect(codes(errors)).toContain('WRONG_CELL_COUNT');
    expect(errors).toHaveLength(1);
  });

  it('passes with exactly 81 cells', () => {
    const errors = SudokuValidator.validate(blankBoard());
    expect(codes(errors)).not.toContain('WRONG_CELL_COUNT');
  });
});

// ---------------------------------------------------------------------------
// OUT_OF_RANGE_POSITION
// ---------------------------------------------------------------------------
describe('OUT_OF_RANGE_POSITION', () => {
  it('reports an error when row is negative', () => {
    const cells = blankBoard();
    // Replace R0C0 with an out-of-range version
    const idx = cells.findIndex(c => c.row === 0 && c.column === 0);
    cells[idx] = { row: -1, column: 0, solved: null, candidates: [] };

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('OUT_OF_RANGE_POSITION');
  });

  it('reports an error when column is 9 or greater', () => {
    const cells = blankBoard();
    const idx = cells.findIndex(c => c.row === 0 && c.column === 0);
    cells[idx] = { row: 0, column: 9, solved: null, candidates: [] };

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('OUT_OF_RANGE_POSITION');
  });

  it('passes for all corner positions (0,0) (0,8) (8,0) (8,8)', () => {
    const errors = SudokuValidator.validate(blankBoard());
    expect(codes(errors)).not.toContain('OUT_OF_RANGE_POSITION');
  });
});

// ---------------------------------------------------------------------------
// DUPLICATE_POSITION
// ---------------------------------------------------------------------------
describe('DUPLICATE_POSITION', () => {
  it('reports an error when two cells share the same (row, column)', () => {
    const cells = blankBoard();
    // Replace the last cell with a duplicate of R0C0
    cells[cells.length - 1] = { row: 0, column: 0, solved: null, candidates: [] };

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('DUPLICATE_POSITION');
  });

  it('does not report a duplicate on a normal board', () => {
    const errors = SudokuValidator.validate(blankBoard());
    expect(codes(errors)).not.toContain('DUPLICATE_POSITION');
  });
});

// ---------------------------------------------------------------------------
// INVALID_SOLVED_VALUE
// ---------------------------------------------------------------------------
describe('INVALID_SOLVED_VALUE', () => {
  it('reports an error when solved is 0', () => {
    const cells = blankBoard();
    get(cells, 0, 0).solved = 0 as unknown as number; // force invalid value

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('INVALID_SOLVED_VALUE');
  });

  it('reports an error when solved is 10', () => {
    const cells = blankBoard();
    get(cells, 0, 0).solved = 10 as unknown as number;

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('INVALID_SOLVED_VALUE');
  });

  it('passes for solved values 1 through 9', () => {
    const cells = blankBoard();
    for (let d = 1; d <= 9; d++) {
      get(cells, d - 1, 0).solved = d;
    }
    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).not.toContain('INVALID_SOLVED_VALUE');
  });
});

// ---------------------------------------------------------------------------
// INVALID_CANDIDATE_VALUE
// ---------------------------------------------------------------------------
describe('INVALID_CANDIDATE_VALUE', () => {
  it('reports an error when a candidate is 0', () => {
    const cells = blankBoard();
    get(cells, 0, 0).candidates = [0, 5];

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('INVALID_CANDIDATE_VALUE');
  });

  it('reports an error when a candidate is 10', () => {
    const cells = blankBoard();
    get(cells, 3, 3).candidates = [3, 10];

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('INVALID_CANDIDATE_VALUE');
  });

  it('passes for candidates containing only values 1-9', () => {
    const cells = blankBoard();
    get(cells, 0, 0).candidates = [1, 2, 3, 9];

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).not.toContain('INVALID_CANDIDATE_VALUE');
  });
});

// ---------------------------------------------------------------------------
// DUPLICATE_SOLVED_IN_UNIT
// ---------------------------------------------------------------------------
describe('DUPLICATE_SOLVED_IN_UNIT', () => {
  it('reports an error when the same digit appears twice in a row', () => {
    const cells = blankBoard();
    get(cells, 0, 0).solved = 5;
    get(cells, 0, 8).solved = 5;

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('DUPLICATE_SOLVED_IN_UNIT');
    expect(errors.some(e => e.message.includes('row 1'))).toBe(true);
  });

  it('reports an error when the same digit appears twice in a column', () => {
    const cells = blankBoard();
    get(cells, 0, 3).solved = 7;
    get(cells, 8, 3).solved = 7;

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('DUPLICATE_SOLVED_IN_UNIT');
    expect(errors.some(e => e.message.includes('column 4'))).toBe(true);
  });

  it('reports an error when the same digit appears twice in a box', () => {
    const cells = blankBoard();
    // Both in box 4 (centre box: rows 3-5, cols 3-5), different row and col
    get(cells, 3, 3).solved = 2;
    get(cells, 5, 5).solved = 2;

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).toContain('DUPLICATE_SOLVED_IN_UNIT');
    expect(errors.some(e => e.message.includes('box 5'))).toBe(true);
  });

  it('allows the same digit in different rows, columns, and boxes', () => {
    const cells = blankBoard();
    // Place digit 1 in R0C0 (box 1) and R3C3 (box 5) — no shared unit
    get(cells, 0, 0).solved = 1;
    get(cells, 3, 3).solved = 1;

    const errors = SudokuValidator.validate(cells);
    expect(codes(errors)).not.toContain('DUPLICATE_SOLVED_IN_UNIT');
  });

  it('passes for a fully blank board', () => {
    const errors = SudokuValidator.validate(blankBoard());
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Multiple errors at once
// ---------------------------------------------------------------------------
describe('multiple errors', () => {
  it('collects all errors across different cells, not stopping at first', () => {
    const cells = blankBoard();
    // Two separate row conflicts
    get(cells, 0, 0).solved = 3;
    get(cells, 0, 8).solved = 3; // duplicate in row 1
    get(cells, 1, 0).solved = 9;
    get(cells, 8, 0).solved = 9; // duplicate in col 1

    const errors = SudokuValidator.validate(cells);
    expect(errors.filter(e => e.code === 'DUPLICATE_SOLVED_IN_UNIT').length).toBeGreaterThanOrEqual(2);
  });
});
