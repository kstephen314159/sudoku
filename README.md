# Sudoku Solver

A TypeScript command-line tool that reads a Sudoku board position from a JSON file and identifies the next logical deduction — or applies a set of moves supplied by the caller.

## Requirements

- Node.js 18+
- npm

Dependencies are installed with `npm install`. No global tools are required; `tsx` and `vitest` run via `npx` / npm scripts.

## Quick start

```bash
npm install
npm start -- data/puzzle.json
```

## Architecture Overview

The project now uses a **client-server architecture**:

```
┌─────────────────────────┐
│   SPA (React-like)      │  ← Renders board, handles UX
│   Port 3000             │
└────────────┬────────────┘
             │ HTTP/REST
             ▼
┌─────────────────────────┐
│  Express.js API Server  │  ← Solver engine, board state
│  Port 3001              │
└─────────────────────────┘
```

**Benefits:**
- ✅ Separation of concerns (UI ↔ Logic)
- ✅ Solver components run server-side
- ✅ Easy to scale independently
- ✅ Can deploy to Lambda, ECS, or any Node.js runtime
- ✅ Board state persists on server (not ephemeral in browser)

## Web UI (Single Page Application)

A responsive TypeScript SPA is provided for interactive Sudoku solving with visualization. The SPA communicates with an Express.js API server that manages the puzzle state and solver logic.

### Prerequisites

- **Node.js** 18+
- **Podman** (optional, for containerized local development)

### Without Containers (Fastest local dev - Recommended)

**Terminal 1: Start the API server**

```bash
npm run dev:api
# Starts on http://localhost:3001
```

**Terminal 2: Start the SPA dev server**

```bash
npm run dev
# Starts on http://localhost:3000 with hot reloading
```

Open http://localhost:3000 in your browser.

### With Podman (Optional - API in container)

Build the API container once:

```bash
podman build -f Dockerfile -t sudoku-api .
```

Then run it (in one terminal):

```bash
podman run --rm \
  -p 3001:3001 \
  -v $(pwd):/app \
  -v /app/node_modules \
  -e NODE_ENV=development \
  -e PORT=3001 \
  sudoku-api
```

In another terminal, start the SPA:

```bash
npm run dev
```

See [PODMAN.md](PODMAN.md) for more container details.
### Using the SPA

1. **Load a puzzle** — Click "Load Puzzle" and select a JSON file (e.g., `data/puzzle.json`)
2. **Visualize** — The board renders with:
   - **Solved cells** — displayed as bold digits (centered)
   - **Candidate cells** — displayed as a 3×3 grid of candidates (1–9)
   - **Eliminated candidates** — shown struck-through and faded
3. **Find next move** — Click "Find Next Move" to invoke the solver via the API
4. **Highlights** — After solving:
   - Affected cells are highlighted in **yellow** with a blue border
   - For `remove_candidate` moves: the specific digit is highlighted in **orange**
   - For `solve` moves: the promoted digit is highlighted in **orange**
5. **Inspect results** — The right sidebar shows:
   - **Last Move** text (human-readable strategy description)
   - **Moves Detail** list (structured cell actions)
   - **Board Stats** (solved cells and total candidates remaining)
6. **Apply Move** — Click the "Apply Move" button to commit the suggested moves to the board

The board and server state update after each move. You can click "Find Next Move" repeatedly to step through the solution interactively.

### API Endpoints

The API server exposes these endpoints (on port 3001):

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/puzzle/load` | Load a new puzzle |
| `GET` | `/api/puzzle/current` | Get current board state |
| `POST` | `/api/solve/next` | Get suggested next move |
| `POST` | `/api/moves/apply` | Apply moves and persist board |
| `GET` | `/api/puzzle/stats` | Get board statistics |
| `GET` | `/health` | Health check |

## Project structure

```
src/
  types.ts      — Shared TypeScript types (Cell, SudokuState, CellAction, …)
  solver.ts     — AdvancedSudokuSolver: 10 strategies applied in priority order
  validator.ts  — SudokuValidator: board sanity checks
  main.ts       — CLI entry point (original interface)
  api/
    index.ts    — Express.js API server setup and routes
  server.ts     — API server entry point
  ui.ts         — SPA UI logic (calls API endpoints)
  index.html    — SPA HTML structure
  style.css     — SPA styling
test/
  main.test.ts       — Unit tests for all solver strategies
  validator.test.ts  — Unit tests for the validator
data/
  puzzle.json   — Current board state (read and written by the CLI)
Dockerfile      — Container image for API server
```

## Board format

The board is stored as a JSON object with a `cells` array of exactly 81 entries. Each cell is one of:

```json
{ "row": 0, "column": 3, "solved": 7 }
{ "row": 0, "column": 4, "candidates": [3, 5, 9] }
```

- `row` and `column` are **0-based** integers (0–8).
- A **solved** cell carries only the `solved` property.
- An **unsolved** cell carries only the `candidates` array (digits 1–9).

The file is written back with one cell object per line for human readability:

```json
{
  "cells": [
    {"row":0,"column":0,"candidates":[4,5,7]},
    {"row":0,"column":1,"solved":9},
    ...
  ]
}
```

## Usage

### Interactive Web UI (Recommended)

The primary workflow is the interactive SPA with the API backend:

**Terminal 1: Start the API**
```bash
npm run dev:api
```

**Terminal 2: Start the SPA**
```bash
npm run dev
```

Open http://localhost:3000 in your browser.

**Workflow:**
1. Click **Load Puzzle** and select a JSON file (e.g., `data/puzzle.json`)
2. Click **Find Next Move** to invoke the solver
3. Review the highlighted cells and strategy explanation
4. Click **Apply Move** to persist the move to disk
5. Repeat until solved

The board state is stored on the API server (`data/puzzle.json`) and updates with each applied move.

### Command-Line Interface (Alternative)

For non-interactive solving, use the CLI directly:

```bash
# See the next logical move
npm start -- data/puzzle.json
```

Reads the board, validates it, runs the solver, and prints:
- The strategy used and a human-readable explanation
- Which cells were solved or had candidates eliminated
- A `moves` array (structured, machine-readable)

Example output:

```
============================================================
SUDOKU SOLVER — next logical move
============================================================

Strategy: AIC: R2C3=4 == R2C3=5 -- R7C3=5 == R9C2=5 -- R5C2=5 == R5C6=5 -- R5C6=4 == R5C4=4 → eliminate 4 from R2C4.

Candidates eliminated:
  R2C4: removed [4] — remaining: [1,5,9]
```

**Apply moves via CLI:**

```bash
npm start -- data/puzzle.json --moves '[
  {"cell":"R2C4","action":"remove_candidate","digit":4}
]'
```

The `--moves` flag accepts a JSON array of `CellAction` objects. The program applies each move to the board, re-validates the result, and **writes the updated board back to the same file**.

Two action types are supported:

| `action` | Effect |
|---|---|
| `remove_candidate` | Removes `digit` from the cell's candidate list |
| `solve` | Sets the cell to `digit` and clears its candidates |

Cell labels use **1-based** row and column numbers (`R1C1` … `R9C9`).

Errors are reported and the file is left unchanged if:
- A cell label is malformed or not found
- A candidate being removed is not present in that cell
- A cell being solved is already solved
- The resulting board fails validation (e.g. duplicate digit in a unit)

Typical CLI workflow:

```bash
# 1. See what the solver recommends
npm start -- data/puzzle.json

# 2. Apply the move it found
npm start -- data/puzzle.json --moves '[{"cell":"R2C4","action":"remove_candidate","digit":4}]'

# 3. Repeat
npm start -- data/puzzle.json
```

## Solver strategies

Strategies are attempted in priority order. The first one that produces a change is returned as the move.

| # | Strategy | Description |
|---|---|---|
| 0 | **Cleanup** | Removes candidates that are already placed in a peer cell (prunes stale state) |
| 1 | **Naked Single** | A cell with exactly one candidate must hold that digit |
| 2 | **Hidden Single** | A digit that can go in only one cell within a unit must go there |
| 3 | **Naked Subset** | N cells in a unit whose combined candidates total exactly N digits → those digits are eliminated from all other cells in the unit (pairs, triples, quads) |
| 4 | **Hidden Subset (rows/cols)** | N digits confined to the same N cells in a row or column → all other candidates in those cells are removed |
| 5 | **Hidden Subset (boxes)** | Same as above, applied to 3×3 boxes |
| 6 | **Locked Candidates** | *Pointing*: a digit within a box confined to one row/col is eliminated from the rest of that row/col. *Claiming*: a digit within a row/col confined to one box is eliminated from the rest of that box |
| 7 | **X-Wing** | A digit appearing in exactly two cells in each of two rows (same columns) can be eliminated from every other cell in those columns (and vice-versa for columns) |
| 8 | **XY-Wing** | Three bivalue cells (pivot + two wings) force an elimination in any cell that sees both wings |
| 9 | **AIC** | Alternating Inference Chain — a chain of strong and weak links between candidates; any cell seeing both endpoints of the chain can have the shared digit eliminated. All valid AICs up to depth 12 are found; the shortest chain is reported |

### AIC chain notation

```
R2C3=4 == R2C3=5 -- R7C3=5 == R9C2=5 -- ...
```

- `==` strong link (if the left node is OFF, the right node must be ON)
- `--` weak link (if the left node is ON, the right node must be OFF)
- `RxCy=d` means digit `d` in row `x`, column `y` (1-based)

### Relationship between XY-Wing and AIC

XY-Wing is logically subsumed by AIC. When expressed at the candidate level (where each node is a cell+digit pair rather than a cell), an XY-Wing is a 6-node AIC:

```
{wingB, Z} == {wingB, X} -- {pivot, X} == {pivot, Y} -- {wingC, Y} == {wingC, Z}
```

The strong links are bivalue-cell partners (within each cell); the weak links are shared digit between cells that see each other. The endpoints both carry digit Z, so any cell seeing both endpoints can have Z eliminated — exactly the XY-Wing deduction.

The AIC implementation in this solver will therefore find every XY-Wing pattern on its own. XY-Wing is retained as a separate earlier strategy for three practical reasons:

- **Performance** — the XY-Wing search is a simple O(n³) loop over bivalue cells; the AIC DFS explores the entire candidate graph and is considerably more expensive.
- **Human-readable output** — `XY-Wing: pivot R3C5 [4,9], wing R3C2 [4,7]…` is clearer than the equivalent 6-node AIC chain string.
- **Strategy ordering** — cheap strategies run first so the expensive AIC search is a last resort.

The same argument applies to X-Wing: it maps to an AIC (or "nice loop") over grouped nodes, so it too is subsumed by AIC in principle. If output clarity and performance were not concerns, both strategies could be removed and AIC alone would cover them.

## Validation

`SudokuValidator.validate(cells)` checks:

1. **Cell count** — exactly 81 cells (bails early if not)
2. **Coordinate range** — every `row` and `column` is in `[0, 8]`
3. **Unique positions** — no two cells share the same `(row, column)`
4. **Digit range** — solved values and all candidates are in `[1, 9]`
5. **Unit uniqueness** — no solved digit appears twice in the same row, column, or box

Each error has a machine-readable `code` and a human `message`. The CLI exits with code 1 and prints all errors if validation fails.

## Development

```bash
npm test           # run all tests once
npm run test:watch # re-run on file changes
npm run build      # compile to dist/ (type-check with emit)
```

There are 39 unit tests across two files covering every strategy, all validator error codes, and AIC-specific behaviour (real puzzle board, shortest-chain selection).

## CI / GitHub Actions

Three workflows run automatically on every push and pull request to any branch:

| Workflow | File | What it checks |
|---|---|---|
| **Security** | `security.yml` | `npm audit` for dependency CVEs (moderate+); CodeQL static analysis for TypeScript/JavaScript vulnerabilities |
| **Dead code** | `code-quality.yml` | `knip` — unused exports, unreachable files, unused imports |
| **Performance** | `code-quality.yml` | Test suite must complete in <30 s; solver on `puzzle.json` must complete in <5 s |

CodeQL results appear in the repository **Security → Code scanning** tab. All other workflow results appear in the **Actions** tab.

The file `.github/copilot-instructions.md` provides equivalent guidance for **manually initiated** Copilot agent sessions — it is context only and does not trigger automatically.

## Output types

```typescript
// A single cell modification produced by a move
type CellAction =
  | { cell: string; action: 'remove_candidate'; digit: number }
  | { cell: string; action: 'solve'; digit: number };

// The board state as returned by the solver
interface SudokuState {
  cells: Cell[];
  lastMove?: string;    // human-readable description
  moves?: CellAction[]; // structured list of cell changes
}
```
