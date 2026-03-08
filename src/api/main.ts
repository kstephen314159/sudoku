import * as fs from 'fs';
import { AdvancedSudokuSolver } from '../core/solver';
import { Cell, CellAction, CellJson, SudokuState, SudokuStateJson } from '../core/types';
import { SudokuValidator } from '../core/validator';

// ---------------------------------------------------------------------------
// Format conversion
// ---------------------------------------------------------------------------

function cellFromJson(j: CellJson): Cell {
  if ('solved' in j) return { row: j.row, column: j.column, solved: j.solved, candidates: [] };
  return { row: j.row, column: j.column, solved: null, candidates: j.candidates };
}

function cellToJson(c: Cell): CellJson {
  if (c.solved !== null) return { row: c.row, column: c.column, solved: c.solved };
  return { row: c.row, column: c.column, candidates: c.candidates };
}

// ---------------------------------------------------------------------------
// Board formatter — one compact cell object per line, matching jq tojson style
// ---------------------------------------------------------------------------

function formatBoardJson(cells: Cell[]): string {
  const lines: string[] = ['{', '  "cells": ['];
  const cellLines = cells.map(c => '    ' + JSON.stringify(cellToJson(c)));
  lines.push(cellLines.join(',\n'));
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Move application
// ---------------------------------------------------------------------------

/** Parses "R1C7" → { row: 0, column: 6 }, or returns null if malformed. */
function parseCellLabel(label: string): { row: number; column: number } | null {
  const m = label.match(/^R(\d+)C(\d+)$/i);
  if (!m) return null;
  return { row: parseInt(m[1], 10) - 1, column: parseInt(m[2], 10) - 1 };
}

/**
 * Clones `cells`, applies each CellAction, and returns the updated array
 * together with any application-level error messages (bad label, missing
 * candidate, etc.).  Validation of the resulting board is left to the caller.
 */
function applyMoves(
  cells: Cell[],
  moves: CellAction[],
): { cells: Cell[]; applyErrors: string[] } {
  const result = cells.map(c => ({ ...c, candidates: [...c.candidates] }));
  const applyErrors: string[] = [];

  for (const move of moves) {
    const pos = parseCellLabel(move.cell);
    if (!pos) {
      applyErrors.push(`Invalid cell label "${move.cell}" — expected format R<row>C<col> (1-based).`);
      continue;
    }
    const cell = result.find(c => c.row === pos.row && c.column === pos.column);
    if (!cell) {
      applyErrors.push(`Cell ${move.cell} not found on board.`);
      continue;
    }
    if (move.action === 'remove_candidate') {
      if (!cell.candidates.includes(move.digit)) {
        applyErrors.push(`${move.cell} does not have candidate ${move.digit} — cannot remove.`);
        continue;
      }
      cell.candidates = cell.candidates.filter(d => d !== move.digit);
    } else if (move.action === 'solve') {
      if (cell.solved !== null) {
        applyErrors.push(`${move.cell} is already solved (${cell.solved}) — cannot solve again.`);
        continue;
      }
      cell.solved = move.digit;
      cell.candidates = [];
    }
  }

  return { cells: result, applyErrors };
}

function stateToJson(s: SudokuState): SudokuStateJson {
  return {
    cells: s.cells.map(cellToJson),
    ...(s.lastMove ? { lastMove: s.lastMove } : {}),
    ...(s.moves?.length ? { moves: s.moves } : {}),
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function cellLabel(cell: Cell): string {
  return `R${cell.row + 1}C${cell.column + 1}`;
}

function formatResult(before: SudokuState, after: SudokuState): void {
  console.log('='.repeat(60));
  console.log('SUDOKU SOLVER — next logical move');
  console.log('='.repeat(60));
  console.log();
  console.log(`Strategy: ${after.lastMove}`);
  console.log();

  // Compute diffs
  const solved: Array<{ label: string; value: number }> = [];
  const eliminated: Array<{ label: string; removed: number[]; remaining: number[] }> = [];

  for (let i = 0; i < after.cells.length; i++) {
    const b = before.cells[i];
    const a = after.cells[i];

    if (!b.solved && a.solved !== null) {
      solved.push({ label: cellLabel(a), value: a.solved });
    } else if (!a.solved) {
      const removed = b.candidates.filter(p => !a.candidates.includes(p));
      if (removed.length > 0) {
        eliminated.push({ label: cellLabel(a), removed, remaining: a.candidates });
      }
    }
  }

  if (solved.length > 0) {
    console.log('Cells solved:');
    for (const { label, value } of solved) {
      console.log(`  ${label} = ${value}`);
    }
    console.log();
  }

  if (eliminated.length > 0) {
    console.log('Candidates eliminated:');
    for (const { label, removed, remaining } of eliminated) {
      console.log(
        `  ${label}: removed [${removed.join(',')}]` +
          (remaining.length > 0 ? ` — remaining: [${remaining.join(',')}]` : ' — now solved'),
      );
    }
    console.log();
  }

  if (solved.length === 0 && eliminated.length === 0) {
    console.log('No changes made.');
    console.log();
  }

  console.log('Next state (JSON):');
  console.log(JSON.stringify(stateToJson(after), null, 2));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);

  // Detect --moves <json> flag
  const movesIdx = args.indexOf('--moves');
  let movesArg: string | null = null;
  if (movesIdx !== -1) {
    if (movesIdx + 1 >= args.length) {
      console.error('Error: --moves requires a JSON array argument.');
      process.exit(1);
    }
    movesArg = args[movesIdx + 1];
    args.splice(movesIdx, 2); // remove --moves + its value from positional args
  }

  const arg = args[0];
  if (!arg) {
    console.error('Error: no input file specified.');
    process.exit(1);
  }
  const raw = fs.readFileSync(arg, 'utf-8');

  let json: SudokuStateJson;
  try {
    json = JSON.parse(raw) as SudokuStateJson;
  } catch (e) {
    console.error('Error: could not parse input as JSON.');
    process.exit(1);
  }

  if (!Array.isArray(json.cells) || json.cells.length !== 81) {
    console.error('Error: cells must be an array of exactly 81 cells.');
    process.exit(1);
  }

  const state: SudokuState = { cells: json.cells.map(cellFromJson) };

  // Validate the board position before attempting to solve.
  const validationErrors = SudokuValidator.validate(state.cells);
  if (validationErrors.length > 0) {
    console.error('Error: invalid board position:');
    for (const e of validationErrors) {
      console.error(`  [${e.code}] ${e.message}`);
    }
    process.exit(1);
  }

  // --moves mode: apply caller-supplied moves, validate, write back to file.
  if (movesArg !== null) {
    let moves: CellAction[];
    try {
      moves = JSON.parse(movesArg) as CellAction[];
    } catch (e) {
      console.error('Error: --moves value is not valid JSON.');
      process.exit(1);
    }
    if (!Array.isArray(moves)) {
      console.error('Error: --moves value must be a JSON array.');
      process.exit(1);
    }

    // Apply moves to a fresh clone of the board.
    const { cells: updated, applyErrors } = applyMoves(state.cells, moves);
    if (applyErrors.length > 0) {
      console.error('Error: move application failed:');
      for (const e of applyErrors) console.error(`  ${e}`);
      process.exit(1);
    }

    // Re-validate the board after applying moves.
    const postErrors = SudokuValidator.validate(updated);
    if (postErrors.length > 0) {
      console.error('Error: board is invalid after applying moves:');
      for (const e of postErrors) console.error(`  [${e.code}] ${e.message}`);
      process.exit(1);
    }

    // Write back to the same file with single-line-per-cell formatting.
    fs.writeFileSync(arg, formatBoardJson(updated) + '\n', 'utf-8');
    console.log(`Applied ${moves.length} move(s) and updated ${arg}.`);
    return;
  }

  // Default mode: run the solver and print the next move.
  const before: SudokuState = {
    cells: state.cells.map(c => ({ ...c, candidates: [...c.candidates] })),
  };

  const after = AdvancedSudokuSolver.solveNext(state);
  formatResult(before, after);
}

main();
