import { Cell } from './types';

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export interface ValidationError {
  /** Short machine-readable code. */
  code:
    | 'WRONG_CELL_COUNT'
    | 'DUPLICATE_POSITION'
    | 'OUT_OF_RANGE_POSITION'
    | 'INVALID_SOLVED_VALUE'
    | 'INVALID_CANDIDATE_VALUE'
    | 'DUPLICATE_SOLVED_IN_UNIT';
  message: string;
}

// ---------------------------------------------------------------------------
// SudokuValidator
// ---------------------------------------------------------------------------

export class SudokuValidator {
  /**
   * Validates a parsed board.
   * Returns an array of errors — empty means the board is valid.
   */
  static validate(cells: Cell[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // -----------------------------------------------------------------------
    // 1. Correct count
    // -----------------------------------------------------------------------
    if (cells.length !== 81) {
      errors.push({
        code: 'WRONG_CELL_COUNT',
        message: `Expected 81 cells, got ${cells.length}.`,
      });
      // Can't usefully continue without a full grid.
      return errors;
    }

    // -----------------------------------------------------------------------
    // 2. Every (row, column) coordinate is in-range and unique
    // -----------------------------------------------------------------------
    const positionSeen = new Set<string>();
    for (const cell of cells) {
      if (cell.row < 0 || cell.row > 8 || cell.column < 0 || cell.column > 8) {
        errors.push({
          code: 'OUT_OF_RANGE_POSITION',
          message: `Cell at (row=${cell.row}, column=${cell.column}) is out of range [0,8].`,
        });
        continue;
      }
      const key = `${cell.row},${cell.column}`;
      if (positionSeen.has(key)) {
        errors.push({
          code: 'DUPLICATE_POSITION',
          message: `Duplicate cell at position R${cell.row + 1}C${cell.column + 1}.`,
        });
      } else {
        positionSeen.add(key);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Each cell's digit(s) are in the range 1-9
    // -----------------------------------------------------------------------
    for (const cell of cells) {
      const label = `R${cell.row + 1}C${cell.column + 1}`;
      if (cell.solved !== null) {
        if (!Number.isInteger(cell.solved) || cell.solved < 1 || cell.solved > 9) {
          errors.push({
            code: 'INVALID_SOLVED_VALUE',
            message: `${label} has invalid solved value ${cell.solved} (must be 1-9).`,
          });
        }
      } else {
        for (const d of cell.candidates) {
          if (!Number.isInteger(d) || d < 1 || d > 9) {
            errors.push({
              code: 'INVALID_CANDIDATE_VALUE',
              message: `${label} has invalid candidate ${d} (must be 1-9).`,
            });
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 4. No solved digit appears twice in the same row, column, or box
    // -----------------------------------------------------------------------
    const boxOf = (cell: Cell) => Math.floor(cell.row / 3) * 3 + Math.floor(cell.column / 3);

    const solvedCells = cells.filter(c => c.solved !== null);

    // Build per-unit indices of solved digits.
    const rowSolved   = new Map<number, Map<number, Cell>>();
    const colSolved   = new Map<number, Map<number, Cell>>();
    const boxSolved   = new Map<number, Map<number, Cell>>();

    for (let i = 0; i < 9; i++) {
      rowSolved.set(i, new Map());
      colSolved.set(i, new Map());
      boxSolved.set(i, new Map());
    }

    for (const cell of solvedCells) {
      const d = cell.solved as number;
      const label = `R${cell.row + 1}C${cell.column + 1}`;
      const box = boxOf(cell);

      const checkUnit = (
        map: Map<number, Map<number, Cell>>,
        unitIdx: number,
        unitName: string,
      ) => {
        const unitMap = map.get(unitIdx)!;
        if (unitMap.has(d)) {
          const other = unitMap.get(d)!;
          const otherLabel = `R${other.row + 1}C${other.column + 1}`;
          errors.push({
            code: 'DUPLICATE_SOLVED_IN_UNIT',
            message: `Digit ${d} appears twice in ${unitName}: ${label} and ${otherLabel}.`,
          });
        } else {
          unitMap.set(d, cell);
        }
      };

      checkUnit(rowSolved, cell.row,    `row ${cell.row + 1}`);
      checkUnit(colSolved, cell.column, `column ${cell.column + 1}`);
      checkUnit(boxSolved, box,         `box ${box + 1}`);
    }

    return errors;
  }
}
