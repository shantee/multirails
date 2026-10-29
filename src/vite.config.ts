import { defineConfig } from 'vite';

// base relative : le dossier dist/ peut être servi depuis n'importe quel chemin
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
