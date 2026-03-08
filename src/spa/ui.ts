import { Cell, CellAction, CellJson, SudokuState, SudokuStateJson } from '../core/types';

// ---------------------------------------------------------------------------
// API Configuration
// ---------------------------------------------------------------------------

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Format conversion
// ---------------------------------------------------------------------------

function cellFromJson(j: CellJson): Cell {
  if ('solved' in j) {
    return { row: j.row, column: j.column, solved: j.solved, candidates: [] };
  }
  return { row: j.row, column: j.column, solved: null, candidates: j.candidates };
}

function parseCellLabel(label: string): { row: number; column: number } | null {
  const m = label.match(/^R(\d+)C(\d+)$/i);
  if (!m) return null;
  return { row: parseInt(m[1], 10) - 1, column: parseInt(m[2], 10) - 1 };
}

// ---------------------------------------------------------------------------
// UI State and Rendering
// ---------------------------------------------------------------------------

interface UIState {
  currentState: SudokuState | null;
  suggestedState: SudokuState | null; // State after solver, waiting to be applied
  lastMoves: CellAction[] | null;
  highlightedCells: Set<string>;
  highlightedDigits: Map<string, Set<number>>; // cellKey -> set of digits to highlight
}

interface CellHighlight {
  cellKey: string;
  digits?: number[];
  highlightType: 'affected' | 'removed' | 'promoted';
}

let uiState: UIState = {
  currentState: null,
  suggestedState: null,
  lastMoves: null,
  highlightedCells: new Set(),
  highlightedDigits: new Map(),
};

function getCellKey(row: number, column: number): string {
  return `${row},${column}`;
}

function getCellKeyFromLabel(label: string): string | null {
  const pos = parseCellLabel(label);
  return pos ? getCellKey(pos.row, pos.column) : null;
}

function showError(message: string): void {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 5000);
  }
}

function clearError(): void {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
}

function updateStats(): void {
  if (!uiState.currentState) return;

  const solved = uiState.currentState.cells.filter(c => c.solved !== null).length;
  const totalCandidates = uiState.currentState.cells.reduce(
    (sum, c) => sum + c.candidates.length,
    0,
  );

  const solvedEl = document.getElementById('stat-solved');
  const candidatesEl = document.getElementById('stat-candidates');

  if (solvedEl) solvedEl.textContent = String(solved);
  if (candidatesEl) candidatesEl.textContent = String(totalCandidates);
}

function renderBoard(): void {
  if (!uiState.currentState) return;

  const boardEl = document.getElementById('board');
  if (!boardEl) return;

  boardEl.innerHTML = '';

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const cell = uiState.currentState.cells.find(c => c.row === row && c.column === col);
      if (!cell) continue;

      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellEl.id = `cell-${getCellKey(row, col)}`;

      // Add box borders
      if ((row + 1) % 3 === 0 && row !== 8) cellEl.classList.add('border-bottom');
      if ((col + 1) % 3 === 0 && col !== 8) cellEl.classList.add('border-right');

      // Determine if this cell is highlighted
      const cellKey = getCellKey(row, col);
      if (uiState.highlightedCells.has(cellKey)) {
        cellEl.classList.add('highlighted');
      }

      if (cell.solved !== null) {
        // Solved cell
        cellEl.classList.add('solved');
        cellEl.textContent = String(cell.solved);
      } else {
        // Cell with candidates
        cellEl.classList.add('candidates');

        const highlightedDigits = uiState.highlightedDigits.get(cellKey);

        for (let digit = 1; digit <= 9; digit++) {
          const candidateEl = document.createElement('div');
          candidateEl.className = 'candidate';
          candidateEl.textContent = String(digit);

          if (cell.candidates.includes(digit)) {
            if (highlightedDigits?.has(digit)) {
              candidateEl.classList.add('highlight-digit');
            }
          } else {
            candidateEl.classList.add('eliminated');
          }

          cellEl.appendChild(candidateEl);
        }
      }

      boardEl.appendChild(cellEl);
    }
  }
}

function updateMovesDetail(): void {
  if (!uiState.lastMoves || uiState.lastMoves.length === 0) {
    const detailEl = document.getElementById('moves-detail');
    if (detailEl) {
      detailEl.innerHTML = '<p class="placeholder">No moves executed</p>';
    }
    return;
  }

  const detailEl = document.getElementById('moves-detail');
  if (!detailEl) return;

  const container = document.createElement('div');
  container.className = 'moves-detail-container';

  const movesList = document.createElement('ul');
  movesList.className = 'moves-list-ul';

  for (const move of uiState.lastMoves) {
    const li = document.createElement('li');
    li.className = 'move-item';

    const cellKey = getCellKeyFromLabel(move.cell);
    if (cellKey) {
      li.setAttribute('data-cell-key', cellKey);
    }

    if (move.action === 'remove_candidate') {
      li.innerHTML = `<strong>${move.cell}</strong> → remove candidate <strong>${move.digit}</strong>`;
      li.classList.add('remove');
    } else if (move.action === 'solve') {
      li.innerHTML = `<strong>${move.cell}</strong> → solve <strong>${move.digit}</strong>`;
      li.classList.add('solve');
    }

    movesList.appendChild(li);
  }

  container.appendChild(movesList);

  // Add Apply button
  const applyBtn = document.createElement('button');
  applyBtn.className = 'apply-moves-btn';
  applyBtn.textContent = 'Apply Move';
  applyBtn.addEventListener('click', handleApplyMoves);

  container.appendChild(applyBtn);

  detailEl.innerHTML = '';
  detailEl.appendChild(container);
}

async function handleApplyMoves(): Promise<void> {
  if (!uiState.currentState || !uiState.lastMoves || uiState.lastMoves.length === 0) {
    showError('No moves to apply');
    return;
  }

  clearError();

  try {
    // Call the API to apply moves
    const response = await fetch(`${API_URL}/api/moves/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves: uiState.lastMoves }),
    });

    if (!response.ok) {
      const error = await response.json();
      const details = Array.isArray(error.details)
        ? error.details.map((d: any) => d.message || String(d)).join('\n')
        : error.message;
      showError(`Move application failed:\n${details}`);
      return;
    }

    const result = await response.json();
    const updatedStateJson = result.state as SudokuStateJson;

    // Update the current state with the applied moves
    uiState.currentState = {
      cells: updatedStateJson.cells.map(cellFromJson),
    };
    uiState.suggestedState = null;
    uiState.lastMoves = null;
    uiState.highlightedCells.clear();
    uiState.highlightedDigits.clear();

    // Update UI
    updateStats();
    renderBoard();

    // Reset moves detail
    const detailEl = document.getElementById('moves-detail');
    if (detailEl) {
      detailEl.innerHTML = '<p class="placeholder">No moves executed</p>';
    }

    // Reset last move text
    const lastMoveEl = document.getElementById('last-move-text');
    if (lastMoveEl) {
      lastMoveEl.textContent = 'Move applied successfully! Click "Find Next Move" to continue.';
    }
  } catch (error) {
    showError(`Error applying moves: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function highlightMovesOnBoard(): void {
  uiState.highlightedCells.clear();
  uiState.highlightedDigits.clear();

  if (!uiState.lastMoves || !uiState.suggestedState) return;

  // Use the suggested state for highlighting (shows what will happen)
  const stateForHighlighting = uiState.suggestedState;

  // Track which moves we've processed to avoid duplicates
  const processedCells = new Set<string>();

  for (const move of uiState.lastMoves) {
    const cellKey = getCellKeyFromLabel(move.cell);
    if (!cellKey) continue;

    const [row, col] = cellKey.split(',').map(Number);
    const cell = stateForHighlighting.cells.find(c => c.row === row && c.column === col);
    if (!cell) continue;

    if (!processedCells.has(cellKey)) {
      uiState.highlightedCells.add(cellKey);
      processedCells.add(cellKey);
    }

    // Track specific digits to highlight
    if (!uiState.highlightedDigits.has(cellKey)) {
      uiState.highlightedDigits.set(cellKey, new Set());
    }

    if (move.action === 'remove_candidate') {
      // Highlight the digit being removed
      uiState.highlightedDigits.get(cellKey)!.add(move.digit);
    } else if (move.action === 'solve') {
      // Highlight the digit being promoted to solved
      uiState.highlightedDigits.get(cellKey)!.add(move.digit);
    }
  }

  renderBoard();
}

async function handleFindNextMove(): Promise<void> {
  if (!uiState.currentState) {
    showError('No puzzle loaded');
    return;
  }

  clearError();

  try {
    // Call the API to get the next move
    const response = await fetch(`${API_URL}/api/solve/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      showError(`Solver error: ${error.message || 'Unknown error'}`);
      return;
    }

    const result = await response.json();
    const suggestedState = result.suggestedState as SudokuStateJson;
    const moves = result.moves as CellAction[];

    // Store the suggested state (not applied yet) and moves for visualization
    uiState.suggestedState = {
      cells: suggestedState.cells.map(cellFromJson),
      lastMove: result.lastMove,
    };
    uiState.lastMoves = moves;

    // Show highlights on the SUGGESTED state (before applying)
    updateMovesDetail();
    highlightMovesOnBoard();

    // Show last move message
    const lastMoveEl = document.getElementById('last-move-text');
    if (lastMoveEl) {
      lastMoveEl.textContent = result.lastMove || 'No move available';
    }
  } catch (error) {
    showError(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleFileUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) return;

  clearError();

  try {
    const text = await file.text();
    const json = JSON.parse(text) as SudokuStateJson;

    // Send puzzle to the API server
    const response = await fetch(`${API_URL}/api/puzzle/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    });

    if (!response.ok) {
      const error = await response.json();
      const details = Array.isArray(error.details)
        ? error.details.map((d: any) => d.message || String(d)).join('\n')
        : error.message;
      showError(`Invalid puzzle:\n${details}`);
      return;
    }

    const result = await response.json();
    const loadedStateJson = result.state as SudokuStateJson;

    // Store the state locally from the API response
    uiState.currentState = {
      cells: loadedStateJson.cells.map(cellFromJson),
    };
    uiState.suggestedState = null;
    uiState.lastMoves = null;
    uiState.highlightedCells.clear();
    uiState.highlightedDigits.clear();

    // Update UI
    const fileNameEl = document.getElementById('file-name');
    if (fileNameEl) {
      fileNameEl.textContent = file.name;
    }

    const findNextBtn = document.getElementById('find-next-move');
    if (findNextBtn) {
      (findNextBtn as HTMLButtonElement).disabled = false;
    }

    const lastMoveEl = document.getElementById('last-move-text');
    if (lastMoveEl) {
      lastMoveEl.textContent = 'Ready to find next move';
    }

    updateStats();
    renderBoard();

    // Clear moves detail
    const detailEl = document.getElementById('moves-detail');
    if (detailEl) {
      detailEl.innerHTML = '<p class="placeholder">No moves yet</p>';
    }
  } catch (error) {
    showError(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('puzzle-file') as HTMLInputElement;
  const findNextBtn = document.getElementById('find-next-move') as HTMLButtonElement;

  if (fileInput) {
    fileInput.addEventListener('change', handleFileUpload);
  }

  if (findNextBtn) {
    findNextBtn.addEventListener('click', handleFindNextMove);
  }

  console.log('Sudoku UI initialized');
});
