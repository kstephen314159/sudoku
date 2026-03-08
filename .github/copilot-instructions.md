# Copilot Agent Instructions

This file is read by the GitHub Copilot agent at the start of every **manually initiated** session. It provides project context and standing review requirements.

Note: security scanning, dead code detection, and performance thresholds are also enforced **automatically on every push** via GitHub Actions workflows in `.github/workflows/`. The checks below are the AI-assisted equivalent for use during interactive sessions.

## Project context

- Language: TypeScript 5.8.3, runtime Node.js 22
- Test framework: Vitest 3.2.4 (`npm test`)
- Entry point: `src/main.ts` (run via `npm start -- data/puzzle.json`)
- Core files: `src/types.ts`, `src/solver.ts`, `src/validator.ts`, `src/main.ts`
- Board state: `data/puzzle.json` (81 cells, one per line)
- 39 unit tests must pass after any change (`npm test`)

## On every session — always do the following

### 1. Security review
- Flag any hardcoded secrets, credentials, or API keys in changed files.
- Flag any use of `eval`, `Function()`, or dynamic code execution.
- Flag any file-system operations that use unsanitised user input (path traversal risk).
- Flag any dependencies added that are not already in `package.json`.

### 2. Dead code detection
- Identify any functions, classes, types, or variables that are exported but never imported elsewhere.
- Identify any private/local functions that are defined but never called.
- Identify any `import` statements whose imported bindings are never used.
- Report dead code as a warning before making changes; do not silently delete it without noting it.

### 3. Performance review
- Flag any change that adds a nested loop over the 81-cell board inside an already O(n²) or worse context — the solver runs strategies repeatedly and inner-loop cost compounds quickly.
- Flag any allocation of large intermediate arrays inside a hot path (e.g., inside `dfs()` or any per-candidate loop).
- Flag any strategy that iterates all 81 cells when it could be scoped to a unit (27 cells).
- If a new strategy is added, estimate its worst-case complexity and note it in the code comment above the method.

## Code conventions
- All solver strategies are `private static` methods on `AdvancedSudokuSolver` returning `SudokuState | null`.
- Every strategy must populate both `moves: CellAction[]` and `lastMove: string` in its return value.
- Cell labels are 1-based (`R1C1`–`R9C9`); internal `row`/`column` fields are 0-based.
- Do not add external runtime dependencies without explicit user approval.
- Run `npm test` and confirm all 39 tests pass before finalising any change.
