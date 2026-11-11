import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 途忆前端（React 版）：开发时 /api 代理到 Node 后端 8787，生产 build 产物由 server.js 托管。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
