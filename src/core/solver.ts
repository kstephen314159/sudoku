import { Cell, CellAction, SudokuState, Unit } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneCells(cells: Cell[]): Cell[] {
  return cells.map(c => ({ ...c, candidates: [...c.candidates] }));
}

function boxOf(cell: Cell): number {
  return Math.floor(cell.row / 3) * 3 + Math.floor(cell.column / 3);
}

/** True when two distinct cells share a row, column, or box. */
function sees(a: Cell, b: Cell): boolean {
  if (a.row === b.row && a.column === b.column) return false;
  return a.row === b.row || a.column === b.column || boxOf(a) === boxOf(b);
}

function getAllUnits(): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < 9; i++) units.push({ type: 'row', idx: i });
  for (let i = 0; i < 9; i++) units.push({ type: 'col', idx: i });
  for (let i = 0; i < 9; i++) units.push({ type: 'box', idx: i });
  return units;
}

function isInUnit(cell: Cell, unit: Unit): boolean {
  switch (unit.type) {
    case 'row': return cell.row === unit.idx;
    case 'col': return cell.column === unit.idx;
    case 'box': return boxOf(cell) === unit.idx;
  }
}

function unitLabel(unit: Unit): string {
  return `${unit.type} ${unit.idx + 1}`;
}

function cellLabel(cell: Cell): string {
  return `R${cell.row + 1}C${cell.column + 1}`;
}

const SUBSET_NAME = ['', '', 'Pair', 'Triple', 'Quad'] as const;

// A specific candidate: digit `digit` in cell (row, column).
type AICNode = { row: number; column: number; digit: number };

function getCombinations<T>(arr: T[], n: number): T[][] {
  if (n === 0) return [[]];
  if (arr.length < n) return [];
  const [first, ...rest] = arr;
  return [
    ...getCombinations(rest, n - 1).map(c => [first, ...c]),
    ...getCombinations(rest, n),
  ];
}

// ---------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------

export class AdvancedSudokuSolver {
  /**
   * Main entry point: applies exactly ONE logical reduction in priority order.
   * Singles → Subsets → Intersections → Fish → Wings
   */
  static solveNext(state: SudokuState): SudokuState {
    // Step 0: prune stale candidates (digits already solved in a peer cell).
    // If any are found, report that as the move so the user sees the cleanup
    // before any strategic deduction is shown.
    const pruned = cloneCells(state.cells);
    const elimsByPruning: Array<{ cellRef: Cell; removed: number[] }> = [];
    for (const cell of pruned) {
      if (cell.solved || cell.candidates.length === 0) continue;
      const placedInPeers = new Set(
        pruned.filter(c => c.solved && sees(cell, c)).map(c => c.solved as number),
      );
      const removed = cell.candidates.filter(d => placedInPeers.has(d));
      if (removed.length > 0) {
        cell.candidates = cell.candidates.filter(d => !placedInPeers.has(d));
        elimsByPruning.push({ cellRef: cell, removed });
      }
    }
    if (elimsByPruning.length > 0) {
      const moves: CellAction[] = elimsByPruning.flatMap(({ cellRef, removed }) =>
        removed.map(d => ({ cell: cellLabel(cellRef), action: 'remove_candidate' as const, digit: d })),
      );
      const detail = moves.map(m => `${m.cell} −[${m.digit}]`).join('; ');
      return {
        cells: pruned,
        moves,
        lastMove: `Cleanup: removed candidates already placed in peer cells → ${detail}.`,
      };
    }

    const strategies = [
      this.findNakedSingle,
      this.findHiddenSingle,
      this.findNakedSubset,
      this.findHiddenSubsetInRowsCols,
      this.findHiddenSubsetInBoxes,
      this.findLockedCandidates,
      this.findXWing,
      this.findXYWing,
      this.findAIC,
    ] as const;

    for (const strategy of strategies) {
      // Each strategy receives a fresh clone so a failed attempt has no side-effects.
      const result = strategy.call(this, cloneCells(pruned));
      if (result) return result;
    }

    return { ...state, cells: pruned, lastMove: 'No further logical moves identified.' };
  }

  // -------------------------------------------------------------------------
  // Strategy 1 – Naked Single
  // A cell with exactly one candidate must contain that digit.
  // -------------------------------------------------------------------------
  private static findNakedSingle(cells: Cell[]): SudokuState | null {
    for (const cell of cells) {
      if (!cell.solved && cell.candidates.length === 1) {
        const value = cell.candidates[0];
        cell.solved = value;
        cell.candidates = [];
        const moves: CellAction[] = [{ cell: cellLabel(cell), action: 'solve', digit: value }];
        return {
          cells,
          moves,
          lastMove: `Naked Single: ${cellLabel(cell)} must be ${value} (only candidate remaining).`,
        };
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Strategy 2 – Hidden Single
  // A digit that has only one possible cell within a unit must go there.
  // -------------------------------------------------------------------------
  private static findHiddenSingle(cells: Cell[]): SudokuState | null {
    for (const unit of getAllUnits()) {
      const unsolved = cells.filter(c => isInUnit(c, unit) && !c.solved);
      for (let d = 1; d <= 9; d++) {
        // Skip digit if already placed in this unit.
        if (cells.some(c => isInUnit(c, unit) && c.solved === d)) continue;
        const withDigit = unsolved.filter(c => c.candidates.includes(d));
        if (withDigit.length === 1) {
          const cell = withDigit[0];
          cell.solved = d;
          cell.candidates = [];
          const moves: CellAction[] = [{ cell: cellLabel(cell), action: 'solve', digit: d }];
          return {
            cells,
            moves,
            lastMove:
              `Hidden Single: ${cellLabel(cell)} is the only cell in ` +
              `${unitLabel(unit)} that can hold ${d}.`,
          };
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Strategy 3 – Naked Subset (Pair / Triple / Quad)
  // N unsolved cells in a unit whose combined candidates total exactly N
  // digits → those digits cannot appear elsewhere in the unit.
  // -------------------------------------------------------------------------
  private static findNakedSubset(cells: Cell[]): SudokuState | null {
    for (const unit of getAllUnits()) {
      const unsolved = cells.filter(c => isInUnit(c, unit) && !c.solved && c.candidates.length > 0);

      for (let n = 2; n <= 4; n++) {
        for (const subset of getCombinations(unsolved, n)) {
          const allCands = new Set(subset.flatMap(c => c.candidates));
          if (allCands.size !== n) continue;

          const others = unsolved.filter(c => !subset.includes(c));
          const affected: Array<{ cell: Cell; removed: number[] }> = [];

          for (const other of others) {
            const removed = other.candidates.filter(p => allCands.has(p));
            if (removed.length > 0) affected.push({ cell: other, removed });
          }

          if (affected.length > 0) {
            for (const { cell, removed } of affected) {
              cell.candidates = cell.candidates.filter(p => !allCands.has(p));
            }
            const cands = [...allCands].sort((a, b) => a - b).join(',');
            const subCells = subset.map(cellLabel).join(', ');
            const moves: CellAction[] = affected.flatMap(({ cell, removed }) =>
              removed.map(d => ({ cell: cellLabel(cell), action: 'remove_candidate' as const, digit: d })),
            );
            const elims = moves.map(m => `${m.cell} −[${m.digit}]`).join('; ');
            return {
              cells,
              moves,
              lastMove:
                `Naked ${SUBSET_NAME[n]}: {${cands}} locked to [${subCells}] ` +
                `in ${unitLabel(unit)} → ${elims}.`,
            };
          }
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Strategy 4 – Hidden Subset (Pair / Triple / Quad)
  // N digits that appear only within the same N cells of a unit → all other
  // candidates can be removed from those N cells.
  // -------------------------------------------------------------------------
  private static findHiddenSubsetInUnits(cells: Cell[], units: Unit[]): SudokuState | null {
    for (const unit of units) {
      const unsolved = cells.filter(c => isInUnit(c, unit) && !c.solved && c.candidates.length > 0);
      const presentDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d =>
        unsolved.some(c => c.candidates.includes(d)),
      );

      for (let n = 2; n <= 4; n++) {
        for (const digitSubset of getCombinations(presentDigits, n)) {
          const digitSet = new Set(digitSubset);
          const covering = unsolved.filter(c => c.candidates.some(p => digitSet.has(p)));
          if (covering.length !== n) continue;

          const affected: Array<{ cell: Cell; removed: number[] }> = [];
          for (const cell of covering) {
            const removed = cell.candidates.filter(p => !digitSet.has(p));
            if (removed.length > 0) affected.push({ cell, removed });
          }

          if (affected.length > 0) {
            for (const { cell } of affected) {
              cell.candidates = cell.candidates.filter(p => digitSet.has(p));
            }
            const subCells = covering.map(cellLabel).join(', ');
            const moves: CellAction[] = affected.flatMap(({ cell, removed }) =>
              removed.map(d => ({ cell: cellLabel(cell), action: 'remove_candidate' as const, digit: d })),
            );
            const elims = moves.map(m => `${m.cell} −[${m.digit}]`).join('; ');
            return {
              cells,
              moves,
              lastMove:
                `Hidden ${SUBSET_NAME[n]}: {${digitSubset.join(',')}} confined to ` +
                `[${subCells}] in ${unitLabel(unit)} → ${elims}.`,
            };
          }
        }
      }
    }
    return null;
  }

  private static findHiddenSubsetInRowsCols(cells: Cell[]): SudokuState | null {
    const units: Unit[] = [
      ...Array.from({ length: 9 }, (_, i) => ({ type: 'row' as const, idx: i })),
      ...Array.from({ length: 9 }, (_, i) => ({ type: 'col' as const, idx: i })),
    ];
    return this.findHiddenSubsetInUnits(cells, units);
  }

  private static findHiddenSubsetInBoxes(cells: Cell[]): SudokuState | null {
    const units: Unit[] = Array.from({ length: 9 }, (_, i) => ({ type: 'box' as const, idx: i }));
    return this.findHiddenSubsetInUnits(cells, units);
  }

  // -------------------------------------------------------------------------
  // Strategy 5 – Locked Candidates (Pointing & Claiming)
  //
  // Pointing:  a digit within a box all falls on one row/col → remove it
  //            from every other cell in that row/col.
  // Claiming:  a digit within a row/col all falls in one box → remove it
  //            from every other cell in that box.
  // -------------------------------------------------------------------------
  private static findLockedCandidates(cells: Cell[]): SudokuState | null {
    // --- Pointing ---
    for (let box = 0; box < 9; box++) {
      const boxCells = cells.filter(c => boxOf(c) === box && !c.solved);
      for (let d = 1; d <= 9; d++) {
        const withD = boxCells.filter(c => c.candidates.includes(d));
        if (withD.length < 2) continue;

        const rows = new Set(withD.map(c => c.row));
        if (rows.size === 1) {
          const row = [...rows][0];
          const targets = cells.filter(
            c => c.row === row && boxOf(c) !== box && !c.solved && c.candidates.includes(d),
          );
          if (targets.length > 0) {
            targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== d); });
            const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: d }));
            return {
              cells,
              moves,
              lastMove:
                `Pointing: ${d} in box ${box + 1} is confined to row ${row + 1} ` +
                `→ eliminated from ${targets.map(cellLabel).join(', ')}.`,
            };
          }
        }

        const cols = new Set(withD.map(c => c.column));
        if (cols.size === 1) {
          const col = [...cols][0];
          const targets = cells.filter(
            c => c.column === col && boxOf(c) !== box && !c.solved && c.candidates.includes(d),
          );
          if (targets.length > 0) {
            targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== d); });
            const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: d }));
            return {
              cells,
              moves,
              lastMove:
                `Pointing: ${d} in box ${box + 1} is confined to col ${col + 1} ` +
                `→ eliminated from ${targets.map(cellLabel).join(', ')}.`,
            };
          }
        }
      }
    }

    // --- Claiming (row) ---
    for (let r = 0; r < 9; r++) {
      const rowCells = cells.filter(c => c.row === r && !c.solved);
      for (let d = 1; d <= 9; d++) {
        const withD = rowCells.filter(c => c.candidates.includes(d));
        if (withD.length < 2) continue;
        const boxes = new Set(withD.map(c => boxOf(c)));
        if (boxes.size !== 1) continue;
        const box = [...boxes][0];
        const targets = cells.filter(
          c => boxOf(c) === box && c.row !== r && !c.solved && c.candidates.includes(d),
        );
        if (targets.length > 0) {
          targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== d); });
          const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: d }));
          return {
            cells,
            moves,
            lastMove:
              `Claiming: ${d} in row ${r + 1} is confined to box ${box + 1} ` +
              `→ eliminated from ${targets.map(cellLabel).join(', ')}.`,
          };
        }
      }
    }

    // --- Claiming (col) ---
    for (let col = 0; col < 9; col++) {
      const colCells = cells.filter(c => c.column === col && !c.solved);
      for (let d = 1; d <= 9; d++) {
        const withD = colCells.filter(c => c.candidates.includes(d));
        if (withD.length < 2) continue;
        const boxes = new Set(withD.map(c => boxOf(c)));
        if (boxes.size !== 1) continue;
        const box = [...boxes][0];
        const targets = cells.filter(
          c => boxOf(c) === box && c.column !== col && !c.solved && c.candidates.includes(d),
        );
        if (targets.length > 0) {
          targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== d); });
          const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: d }));
          return {
            cells,
            moves,
            lastMove:
              `Claiming: ${d} in col ${col + 1} is confined to box ${box + 1} ` +
              `→ eliminated from ${targets.map(cellLabel).join(', ')}.`,
          };
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Strategy 6 – X-Wing
  // For digit D: if D appears in exactly 2 cells in each of two rows, and
  // those cells share the same two columns, then D can be eliminated from
  // every other cell in those two columns (and vice-versa, with rows/cols
  // swapped).
  // -------------------------------------------------------------------------
  private static findXWing(cells: Cell[]): SudokuState | null {
    for (let d = 1; d <= 9; d++) {
      // Row-based
      const qualifyingRows: Array<{ row: number; cols: [number, number] }> = [];
      for (let r = 0; r < 9; r++) {
        const withD = cells.filter(c => c.row === r && !c.solved && c.candidates.includes(d));
        if (withD.length === 2) {
          const [a, b] = withD.map(c => c.column).sort((x, y) => x - y) as [number, number];
          qualifyingRows.push({ row: r, cols: [a, b] });
        }
      }
      for (const [r1, r2] of getCombinations(qualifyingRows, 2)) {
        if (r1.cols[0] !== r2.cols[0] || r1.cols[1] !== r2.cols[1]) continue;
        const [col1, col2] = r1.cols;
        const targets = cells.filter(
          c => !c.solved && c.candidates.includes(d) &&
            (c.column === col1 || c.column === col2) &&
            c.row !== r1.row && c.row !== r2.row,
        );
        if (targets.length > 0) {
          targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== d); });
          const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: d }));
          return {
            cells,
            moves,
            lastMove:
              `X-Wing: ${d} in rows ${r1.row + 1}&${r2.row + 1} at cols ` +
              `${col1 + 1}&${col2 + 1} → eliminated from ` +
              `${targets.map(cellLabel).join(', ')}.`,
          };
        }
      }

      // Col-based
      const qualifyingCols: Array<{ col: number; rows: [number, number] }> = [];
      for (let col = 0; col < 9; col++) {
        const withD = cells.filter(c => c.column === col && !c.solved && c.candidates.includes(d));
        if (withD.length === 2) {
          const [a, b] = withD.map(c => c.row).sort((x, y) => x - y) as [number, number];
          qualifyingCols.push({ col, rows: [a, b] });
        }
      }
      for (const [c1, c2] of getCombinations(qualifyingCols, 2)) {
        if (c1.rows[0] !== c2.rows[0] || c1.rows[1] !== c2.rows[1]) continue;
        const [row1, row2] = c1.rows;
        const targets = cells.filter(
          c => !c.solved && c.candidates.includes(d) &&
            (c.row === row1 || c.row === row2) &&
            c.column !== c1.col && c.column !== c2.col,
        );
        if (targets.length > 0) {
          targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== d); });
          const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: d }));
          return {
            cells,
            moves,
            lastMove:
              `X-Wing: ${d} in cols ${c1.col + 1}&${c2.col + 1} at rows ` +
              `${row1 + 1}&${row2 + 1} → eliminated from ` +
              `${targets.map(cellLabel).join(', ')}.`,
          };
        }
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Strategy 8 – Alternating Inference Chain (AIC)
  //
  // Builds a chain of nodes alternating strong and weak links.
  //   Strong link: if node A is OFF, node B MUST be ON.
  //     • Conjugate pair: digit appears exactly twice in a unit → the two
  //       cells are strongly linked for that digit.
  //     • Bivalue cell: a cell with exactly 2 candidates has a strong link
  //       between its two candidates (within the same cell).
  //   Weak link: if node A is ON, node B MUST be OFF.
  //     • Any two candidates of the same digit in the same unit.
  //     • Any two different candidates in the same cell.
  //
  // Elimination rule: the chain starts at node S and ends at node E,
  // where the last link traversed is a strong link. Either S or E is always
  // ON. Therefore any cell that sees both S and E (same digit) can eliminate
  // that digit.  If S and E are in the same cell but have different digits,
  // all other candidates in that cell can be eliminated.
  // -------------------------------------------------------------------------
  private static findAIC(cells: Cell[]): SudokuState | null {
    const MAX_DEPTH = 12;

    const nodeCell = (n: AICNode) =>
      cells.find(c => c.row === n.row && c.column === n.column)!;

    const nodeKey = (n: AICNode) => `${n.row},${n.column},${n.digit}`;

    const inPath = (path: AICNode[], n: AICNode) =>
      path.some(p => p.row === n.row && p.column === n.column && p.digit === n.digit);

    // Deduplicate an array of nodes.
    const dedup = (nodes: AICNode[]): AICNode[] => {
      const seen = new Set<string>();
      return nodes.filter(n => { const k = nodeKey(n); return seen.has(k) ? false : (seen.add(k), true); });
    };

    // Strong links from node: conjugate pairs in units + bivalue-cell partner.
    const strongLinks = (node: AICNode): AICNode[] => {
      const cell = nodeCell(node);
      const results: AICNode[] = [];
      // Conjugate pairs
      const units: Unit[] = [
        { type: 'row', idx: node.row },
        { type: 'col', idx: node.column },
        { type: 'box', idx: boxOf(cell) },
      ];
      for (const unit of units) {
        const peers = cells.filter(c =>
          isInUnit(c, unit) && !c.solved &&
          !(c.row === node.row && c.column === node.column) &&
          c.candidates.includes(node.digit),
        );
        if (peers.length === 1) {
          results.push({ row: peers[0].row, column: peers[0].column, digit: node.digit });
        }
      }
      // Bivalue-cell partner
      if (cell.candidates.length === 2) {
        const other = cell.candidates.find(d => d !== node.digit)!;
        results.push({ row: node.row, column: node.column, digit: other });
      }
      return dedup(results);
    };

    // Weak links from node: same digit in same unit + other candidates in same cell.
    const weakLinks = (node: AICNode): AICNode[] => {
      const cell = nodeCell(node);
      const results: AICNode[] = [];
      // Same digit, peer cells
      for (const c of cells) {
        if (c.solved || (c.row === node.row && c.column === node.column)) continue;
        if (c.candidates.includes(node.digit) && sees(cell, c)) {
          results.push({ row: c.row, column: c.column, digit: node.digit });
        }
      }
      // Same cell, other digits
      for (const d of cell.candidates) {
        if (d !== node.digit) results.push({ row: node.row, column: node.column, digit: d });
      }
      return dedup(results);
    };

    // Can the chain be closed here? Returns true when start+end could together
    // yield eliminations. The actual eliminations are verified in getEliminations.
    const canClose = (start: AICNode, end: AICNode): boolean => {
      // Same cell, different digits → other candidates in that cell can be eliminated.
      if (start.row === end.row && start.column === end.column) return true;
      // Same digit → any peer seeing both can eliminate that digit.
      if (start.digit === end.digit) return true;
      return false;
    };

    // Compute eliminations from a closed chain.
    const getEliminations = (chain: AICNode[]): Array<AICNode> => {
      const start = chain[0];
      const end = chain[chain.length - 1];
      const elims: AICNode[] = [];
      if (start.digit === end.digit) {
        // Any cell seeing both endpoints can eliminate that digit.
        const sc = nodeCell(start);
        const ec = nodeCell(end);
        for (const c of cells) {
          if (c.solved) continue;
          if (c.row === start.row && c.column === start.column) continue;
          if (c.row === end.row && c.column === end.column) continue;
          if (c.candidates.includes(start.digit) && sees(c, sc) && sees(c, ec)) {
            elims.push({ row: c.row, column: c.column, digit: start.digit });
          }
        }
      } else if (start.row === end.row && start.column === end.column) {
        // Same cell: eliminate all candidates except start.digit and end.digit.
        const c = nodeCell(start);
        for (const d of c.candidates) {
          if (d !== start.digit && d !== end.digit) {
            elims.push({ row: start.row, column: start.column, digit: d });
          }
        }
      }
      return elims;
    };

    const formatChain = (chain: AICNode[]): string =>
      chain.map((n, i) => {
        const label = `${cellLabel(nodeCell(n))}=${n.digit}`;
        if (i === chain.length - 1) return label;
        return label + (i % 2 === 0 ? ' ==' : ' --');
      }).join(' ');

    // DFS: collects ALL valid chains into `results`.
    // `bestLen` tracks the shortest chain found so far; any path already at or
    // beyond that length is pruned (it cannot produce a shorter result).
    const allChains: AICNode[][] = [];
    let bestLen = MAX_DEPTH; // chains must be strictly shorter than this to matter

    const dfs = (current: AICNode, needStrong: boolean, path: AICNode[]): void => {
      // Prune: even adding one more node won't beat the current best.
      if (path.length >= bestLen) return;
      const nexts = needStrong ? strongLinks(current) : weakLinks(current);
      for (const next of nexts) {
        if (inPath(path, next)) continue;
        const newPath = [...path, next];
        // After a strong link, check whether this node closes a valid chain.
        if (needStrong && newPath.length >= 3 && canClose(path[0], next)) {
          if (getEliminations(newPath).length > 0) {
            allChains.push(newPath);
            if (newPath.length < bestLen) bestLen = newPath.length;
            // Don't return — keep exploring; a sibling branch may be shorter.
          }
        }
        dfs(next, !needStrong, newPath);
      }
    };

    // Try every candidate as a starting node.
    for (const cell of cells) {
      if (cell.solved) continue;
      for (const digit of cell.candidates) {
        const start: AICNode = { row: cell.row, column: cell.column, digit };
        dfs(start, true, [start]);
      }
    }

    if (allChains.length === 0) return null;

    // Pick the shortest chain (ties broken by iteration / discovery order).
    const chain = allChains.reduce((a, b) => a.length <= b.length ? a : b);
    const elims = getEliminations(chain);
    // Apply eliminations.
    for (const e of elims) {
      const target = cells.find(c => c.row === e.row && c.column === e.column)!;
      target.candidates = target.candidates.filter(d => d !== e.digit);
    }
    const moves: CellAction[] = elims.map(e => ({ cell: cellLabel(nodeCell(e)), action: 'remove_candidate' as const, digit: e.digit }));
    return {
      cells,
      moves,
      lastMove:
        `AIC: ${formatChain(chain)} → eliminate ${elims.map(e => `${e.digit} from ${cellLabel(nodeCell(e))}`).join(', ')}.`,
    };
  }

  // -------------------------------------------------------------------------
  // Strategy 7 – XY-Wing
  // Three bi-value cells: pivot [x,y], wingB [x,z], wingC [y,z].
  // Pivot sees both wings. Any cell seeing both wingB and wingC cannot be z.
  // -------------------------------------------------------------------------
  private static findXYWing(cells: Cell[]): SudokuState | null {
    const biValue = cells.filter(c => !c.solved && c.candidates.length === 2);

    for (const pivot of biValue) {
      const [x, y] = pivot.candidates;
      const visibleBiValue = biValue.filter(c => sees(pivot, c));

      for (const wingB of visibleBiValue) {
        if (!wingB.candidates.includes(x)) continue;
        const z = wingB.candidates.find(p => p !== x);
        if (z === undefined || z === y) continue; // degenerate

        for (const wingC of visibleBiValue) {
          if (wingC === wingB) continue;
          if (wingC.candidates.length !== 2) continue;
          if (!wingC.candidates.includes(y) || !wingC.candidates.includes(z)) continue;

          // Valid XY-Wing: eliminate z from any cell seeing both wings
          const targets = cells.filter(
            c => !c.solved && c !== wingB && c !== wingC &&
              c.candidates.includes(z) && sees(c, wingB) && sees(c, wingC),
          );
          if (targets.length > 0) {
            targets.forEach(c => { c.candidates = c.candidates.filter(p => p !== z); });
            const moves: CellAction[] = targets.map(c => ({ cell: cellLabel(c), action: 'remove_candidate' as const, digit: z }));
            return {
              cells,
              moves,
              lastMove:
                `XY-Wing: pivot ${cellLabel(pivot)} [${x},${y}], ` +
                `wing ${cellLabel(wingB)} [${x},${z}], ` +
                `wing ${cellLabel(wingC)} [${y},${z}] ` +
                `→ eliminate ${z} from ${targets.map(cellLabel).join(', ')}.`,
            };
          }
        }
      }
    }
    return null;
  }
}
