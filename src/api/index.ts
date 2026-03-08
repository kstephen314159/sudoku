import express, { Express, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { AdvancedSudokuSolver } from '../solver';
import { Cell, CellAction, CellJson, SudokuState, SudokuStateJson } from '../types';
import { SudokuValidator } from '../validator';

// ---------------------------------------------------------------------------
// Disk-based state management
// ---------------------------------------------------------------------------

const PUZZLE_PATH = path.join(process.cwd(), 'data', 'puzzle.json');

async function readBoardFromDisk(): Promise<SudokuState | null> {
  try {
    const content = await fs.readFile(PUZZLE_PATH, 'utf-8');
    const json = JSON.parse(content) as SudokuStateJson;
    return {
      cells: json.cells.map(cellFromJson),
      ...(json.lastMove ? { lastMove: json.lastMove } : {}),
      ...(json.moves ? { moves: json.moves } : {}),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null; // File doesn't exist yet
    }
    throw error;
  }
}

async function writeBoardToDisk(state: SudokuState): Promise<void> {
  await fs.writeFile(PUZZLE_PATH, JSON.stringify(stateToJson(state), null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Format conversion utilities
// ---------------------------------------------------------------------------

function cellFromJson(j: CellJson): Cell {
  if ('solved' in j) {
    return { row: j.row, column: j.column, solved: j.solved, candidates: [] };
  }
  return { row: j.row, column: j.column, solved: null, candidates: j.candidates };
}

function cellToJson(c: Cell): CellJson {
  if (c.solved !== null) return { row: c.row, column: c.column, solved: c.solved };
  return { row: c.row, column: c.column, candidates: c.candidates };
}

function stateToJson(state: SudokuState): SudokuStateJson {
  return {
    cells: state.cells.map(cellToJson),
    ...(state.lastMove ? { lastMove: state.lastMove } : {}),
    ...(state.moves?.length ? { moves: state.moves } : {}),
  };
}

function parseCellLabel(label: string): { row: number; column: number } | null {
  const m = label.match(/^R(\d+)C(\d+)$/i);
  if (!m) return null;
  return { row: parseInt(m[1], 10) - 1, column: parseInt(m[2], 10) - 1 };
}

/**
 * Applies CellActions to the board state, returning updated cells or error messages.
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
        applyErrors.push(
          `${move.cell} does not have candidate ${move.digit} — cannot remove.`,
        );
        continue;
      }
      cell.candidates = cell.candidates.filter(d => d !== move.digit);
    } else if (move.action === 'solve') {
      if (cell.solved !== null) {
        applyErrors.push(
          `${move.cell} is already solved (${cell.solved}) — cannot solve again.`,
        );
        continue;
      }
      cell.solved = move.digit;
      cell.candidates = [];
    }
  }

  return { cells: result, applyErrors };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // CORS headers (allow SPA to call API)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Load puzzle from JSON (or write to disk if already loaded)
  app.post('/api/puzzle/load', async (req: Request, res: Response) => {
    try {
      const json = req.body as SudokuStateJson;

      if (!Array.isArray(json.cells) || json.cells.length !== 81) {
        return res.status(400).json({
          error: 'Invalid puzzle',
          message: 'cells must be an array of exactly 81 cells.',
        });
      }

      const cells = json.cells.map(cellFromJson);

      // Validate
      const validationErrors = SudokuValidator.validate(cells);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validationErrors,
        });
      }

      const boardState = { cells };

      // Persist to disk
      await writeBoardToDisk(boardState);

      res.json({
        success: true,
        message: 'Puzzle loaded and persisted to disk',
        state: stateToJson(boardState),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get current board state from disk
  app.get('/api/puzzle/current', async (req: Request, res: Response) => {
    try {
      const boardState = await readBoardFromDisk();
      if (!boardState) {
        return res.status(400).json({
          error: 'No puzzle loaded',
          message: 'Call POST /api/puzzle/load first',
        });
      }

      res.json(stateToJson(boardState));
    } catch (error) {
      res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Find next move
  app.post('/api/solve/next', async (req: Request, res: Response) => {
    try {
      const boardState = await readBoardFromDisk();
      if (!boardState) {
        return res.status(400).json({
          error: 'No puzzle loaded',
          message: 'Call POST /api/puzzle/load first',
        });
      }

      // Solver returns the state with moves already applied
      const suggestedState = AdvancedSudokuSolver.solveNext(boardState);

      // Return the suggested state WITHOUT applying it yet
      res.json({
        success: true,
        suggestedState: stateToJson(suggestedState),
        moves: suggestedState.moves || [],
        lastMove: suggestedState.lastMove || '',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Solver error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Apply moves to board and persist to disk
  app.post('/api/moves/apply', async (req: Request, res: Response) => {
    try {
      const boardState = await readBoardFromDisk();
      if (!boardState) {
        return res.status(400).json({
          error: 'No puzzle loaded',
          message: 'Call POST /api/puzzle/load first',
        });
      }

      const { moves } = req.body as { moves: CellAction[] };

      if (!Array.isArray(moves) || moves.length === 0) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'moves must be a non-empty array',
        });
      }

      // Apply moves to the current board
      const { cells: updated, applyErrors } = applyMoves(boardState.cells, moves);

      if (applyErrors.length > 0) {
        return res.status(400).json({
          error: 'Move application failed',
          details: applyErrors,
        });
      }

      // Re-validate the board
      const validationErrors = SudokuValidator.validate(updated);
      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed after applying moves',
          details: validationErrors,
        });
      }

      // Update and persist the board state
      const updatedState = { cells: updated };
      await writeBoardToDisk(updatedState);

      res.json({
        success: true,
        message: `Applied ${moves.length} move(s)`,
        state: stateToJson(updatedState),
      });
    } catch (error) {
      res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get board statistics
  app.get('/api/puzzle/stats', async (req: Request, res: Response) => {
    try {
      const boardState = await readBoardFromDisk();
      if (!boardState) {
        return res.status(400).json({
          error: 'No puzzle loaded',
          message: 'Call POST /api/puzzle/load first',
        });
      }

      const solved = boardState.cells.filter(c => c.solved !== null).length;
      const totalCandidates = boardState.cells.reduce((sum, c) => sum + c.candidates.length, 0);
      const emptyCells = boardState.cells.filter(c => c.solved === null).length;

      res.json({
        solved,
        empty: emptyCells,
        totalCandidates,
        progress: `${solved}/81`,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Server error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path,
    });
  });

  return app;
}
