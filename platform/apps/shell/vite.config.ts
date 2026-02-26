import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'node:path';

/**
 * Inject modulepreload hints for the bootstrap chunk (loaded via dynamic import).
 * Without this, the browser only discovers bootstrap.js + bootstrap.css after
 * main.tsx executes, adding a full round-trip to the critical path.
 */
function preloadBootstrap(): Plugin {
  return {
    name: 'preload-bootstrap',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;

        const bootstrapJs = Object.keys(ctx.bundle).find(
          (k) => k.startsWith('assets/bootstrap-') && k.endsWith('.js'),
        );
        const bootstrapCss = Object.keys(ctx.bundle).find(
          (k) => k.startsWith('assets/bootstrap-') && k.endsWith('.css'),
        );

        const tags: string[] = [];
        if (bootstrapJs) {
          tags.push(`<link rel="modulepreload" crossorigin href="/${bootstrapJs}">`);
        }
        if (bootstrapCss) {
          tags.push(`<link rel="preload" as="style" href="/${bootstrapCss}">`);
        }

        if (tags.length === 0) return html;

        // Insert after the last existing <link> in <head>
        return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preloadBootstrap(),
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
