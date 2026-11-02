import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  // `VITE_API_PROXY` is dev-only (not part of the client bundle).
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiProxy = env.VITE_API_PROXY || process.env.VITE_API_PROXY || 'http://localhost:4000';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: Number(process.env.PORT) || 5173,
      strictPort: false,
      host: true,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
      chunkSizeWarningLimit: 1200,
    },
  };
});
