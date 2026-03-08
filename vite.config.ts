import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/spa',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: false,
  },
});
