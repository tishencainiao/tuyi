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
    // antd/echarts 单库超过 500KB 属预期，拆包后不再告警
    chunkSizeWarningLimit: 1200,
    // v3.4.0 工程化：拆包，避免单 chunk 超 500KB
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom', 'zustand'],
          'vendor-antd': ['antd', '@ant-design/icons'],
          'vendor-echarts': ['echarts'],
          'vendor-markdown': ['react-markdown'],
        },
      },
    },
  },
});
