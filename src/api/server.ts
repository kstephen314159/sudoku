import { createApp } from './index';

const PORT = process.env.PORT || 3001;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Sudoku API server running on http://localhost:${PORT}`);
  console.log(`Health check: GET http://localhost:${PORT}/health`);
  console.log(`API endpoints:`);
  console.log(`  POST http://localhost:${PORT}/api/puzzle/load`);
  console.log(`  GET  http://localhost:${PORT}/api/puzzle/current`);
  console.log(`  POST http://localhost:${PORT}/api/solve/next`);
  console.log(`  POST http://localhost:${PORT}/api/moves/apply`);
  console.log(`  GET  http://localhost:${PORT}/api/puzzle/stats`);
});
