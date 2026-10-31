import { defineConfig } from 'vite';

// Relative Pfade, damit dist/ auch in einem Unterordner funktioniert
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
