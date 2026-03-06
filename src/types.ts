export interface Cell {
  row: number; // 0-based row
  column: number; // 0-based column
  solved: number | null;
  candidates: number[]; // candidates (1-9)
}

/** A structured description of a single cell modification produced by a move. */
export type CellAction =
  | { cell: string; action: 'remove_candidate'; digit: number }
  | { cell: string; action: 'solve'; digit: number };

export interface SudokuState {
  cells: Cell[];
  lastMove?: string;
  moves?: CellAction[];
}

// ---------------------------------------------------------------------------
// JSON / file-format types
// Mutually exclusive: a cell is EITHER solved OR has candidates, never both.
// ---------------------------------------------------------------------------
export type CellJson =
  | { row: number; column: number; solved: number }
  | { row: number; column: number; candidates: number[] };

export interface SudokuStateJson {
  cells: CellJson[];
  lastMove?: string;
  moves?: CellAction[];
}

/** A named unit (row, column, or 3×3 box) */
export interface Unit {
  type: 'row' | 'col' | 'box';
  idx: number; // 0-based index
}
