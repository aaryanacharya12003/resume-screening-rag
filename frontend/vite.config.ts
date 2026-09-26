import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin /api in dev so the httpOnly auth cookie just works.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:3001', changeOrigin: true },
    },
  },
});
