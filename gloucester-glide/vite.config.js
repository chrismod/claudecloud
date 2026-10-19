import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'client',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: {
    port: 5173,
    fs: { allow: [here] },
    proxy: { '/api': 'http://localhost:8787' },
  },
});
