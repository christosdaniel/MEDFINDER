import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from a sub-folder on GitHub Pages, e.g. /MEDFINDER/pharmacy/
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    // Forward /api to the backend during development.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
