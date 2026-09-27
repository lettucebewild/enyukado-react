import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite proxies /api requests to the existing Express backend during dev,
// so your React code can just call fetch('/api/...') with no CORS setup needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
