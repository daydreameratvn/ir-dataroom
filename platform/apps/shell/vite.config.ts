import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'shell',
      manifest: true,
      remotes: {
        sample: {
          type: 'module',
          name: 'sample',
          entry:
            process.env.VITE_SAMPLE_REMOTE_URL ??
            'http://sample.oasis.localhost:1355/mf-manifest.json',
          entryGlobalName: 'sample',
        },
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        'react-router-dom': { singleton: true },
        zustand: { singleton: true },
        '@tanstack/react-query': { singleton: true },
        i18next: { singleton: true },
        'react-i18next': { singleton: true },
      },
    }),
  ],
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
