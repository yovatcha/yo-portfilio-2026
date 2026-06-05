import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // The portrait + any static assets live here and are served from the site root.
  publicDir: 'src/public',
  server: {
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
