import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    server: {
      deps: {
        // Ensure vitest resolves dependencies from the platform workspace
        moduleDirectories: [
          path.resolve(__dirname, '../../node_modules'),
          'node_modules',
        ],
      },
    },
  },
});
