import { defineConfig } from 'vite';

// Relative Pfade, damit dist/ auch in einem Unterordner auf dem Server funktioniert
export default defineConfig({
  base: './',
});
