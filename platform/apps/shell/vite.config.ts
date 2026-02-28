import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { federation } from '@module-federation/vite';
import path from 'node:path';
import fs from 'node:fs';

const BUILD_ID = Date.now().toString();

/**
 * Emit a build-id.txt alongside the bundle so the running app can poll
 * for new deployments and prompt the user to reload.
 */
function emitBuildId(): Plugin {
  return {
    name: 'emit-build-id',
    writeBundle(options) {
      const dir = options.dir ?? path.resolve(__dirname, 'dist');
      fs.writeFileSync(path.join(dir, 'build-id.txt'), BUILD_ID);
    },
  };
}

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
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    preloadBootstrap(),
    emitBuildId(),
    federation({
      name: 'shell',
      manifest: true,
      remotes: {
        // Sample remote is a template — only loaded when explicitly running.
        // Start it with: VITE_SAMPLE_REMOTE_URL=http://sample.oasis.localhost:1355/mf-manifest.json bun run dev:shell
        ...(process.env.VITE_SAMPLE_REMOTE_URL
          ? {
              sample: {
                type: 'module',
                name: 'sample',
                entry: process.env.VITE_SAMPLE_REMOTE_URL,
                entryGlobalName: 'sample',
              },
            }
          : {}),
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
        target: process.env.AUTH_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        // When proxying to HTTPS (deployed), rewrite the origin header
        ...(process.env.AUTH_PROXY_TARGET?.startsWith('https') ? { secure: true } : {}),
      },
    },
  },
});
