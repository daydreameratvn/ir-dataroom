---
name: platform-dev
description: |
  Module Federation setup, component conventions, and platform development patterns.
  Use when: creating remote apps, configuring Module Federation, adding UI components,
  working with shadcn/ui, or developing features in platform/.
  Triggers on: files in platform/, Module Federation config, vite.config.ts in platform,
  shadcn components, RemoteLoader, entry.tsx, or platform-related development.
---

# Platform Development Patterns

## Module Federation

### Async Bootstrap Pattern (Required for All Apps)

```
main.tsx -> import('./bootstrap') -> bootstrap.tsx -> createRoot
```

Never import React or shared dependencies synchronously in `main.tsx`. The dynamic import lets Module Federation negotiate shared module versions before React loads.

### Remote Config (Template)

Each remote's `vite.config.ts` exposes exactly ONE entry point:

```ts
federation({
  name: '<remoteName>',
  filename: 'remoteEntry.js',
  exposes: {
    './entry': './src/entry.tsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^18.0.0' },
    'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
    'react-router-dom': { singleton: true },
    zustand: { singleton: true },
    '@tanstack/react-query': { singleton: true },
  },
})
```

### Host Config

The shell registers each remote in its `vite.config.ts`:

```ts
federation({
  name: 'shell',
  remotes: {
    <remoteName>: {
      type: 'module',
      name: '<remoteName>',
      entry: process.env.VITE_<REMOTE>_URL ?? 'http://<remoteName>.oasis.localhost:1355/mf-manifest.json',
      entryGlobalName: '<remoteName>',
    },
  },
  shared: { /* same shared config as remotes */ },
})
```

### Dev Server URLs (Portless)

The platform uses portless to replace port numbers with stable `.localhost` URLs. The proxy runs on port 1355 and auto-starts when any app runs.

| App    | Portless URL                           | Legacy Port |
| ------ | -------------------------------------- | ----------- |
| shell  | `http://oasis.localhost:1355`          | 3000        |
| sample | `http://sample.oasis.localhost:1355`   | 3001        |

New remote apps should use `<name>.oasis` as their portless name and register a `dev:legacy` script with the next available port.

### Standalone vs Embedded Mode

Every remote app MUST work in two modes:

1. **Standalone** — runs from its own `index.html` with its own routing, auth, and layout.
2. **Embedded** — the shell imports `entry.tsx` at runtime via Module Federation.

```tsx
// entry.tsx pattern for every remote
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from './routes';

interface EntryProps {
  basePath?: string;
}

export default function Entry({ basePath = '/' }: EntryProps) {
  const router = createMemoryRouter(routes, {
    initialEntries: [basePath],
  });
  return <RouterProvider router={router} />;
}
```

When embedded, the remote uses `createMemoryRouter` so its routing doesn't conflict with the shell's browser router.

---

## UI Component System

### shadcn/ui Setup

```bash
cd platform
bun ui:add <component-name>
# or: cd libs/shared-ui && bunx shadcn@latest add <component-name>
```

### Component Layers

1. **shadcn/ui primitives** (`libs/shared-ui/src/components/ui/`) — Low-level building blocks
2. **Papaya composites** (`libs/shared-ui/src/composites/`) — Business-aware components (DataTable, MarkdownRenderer, etc.)
3. **App-specific components** — `apps/<app>/src/components/` or `apps/<app>/src/features/<feature>/components/`

---

## Code Conventions

### Feature Folder Structure

```
features/
  <feature-name>/
    <FeatureName>Page.tsx
    components/
    hooks/
    api.ts
    types.ts
    index.ts
```

### Component Rules

- Named function declarations, not arrow functions assigned to const
- Props interfaces in same file, named `{ComponentName}Props`
- One component per file, default export
- No `any` types — use `unknown` and narrow with type guards

### State Management

- **Zustand** for client-only state. One store per app, never shared across MF boundary.
- **TanStack Query** for ALL server data. No manual `fetch` + `useState`.
- **No Redux.** Context API only for theme/auth providers.

### Shared Libraries (`libs/`)

- Consumed via bun workspace protocol: `"@papaya/shared-ui": "workspace:*"`
- Bundled into each app at build time (NOT exposed through Module Federation)
- Every lib has a barrel `index.ts` that controls the public API

### Styling

- Tailwind CSS 4 everywhere. No CSS modules, no styled-components, no inline styles.
- Use `cn()` from `@papaya/shared-ui` for conditional class merging

---

## Workflow Rules for Claude Code

### When displaying AI agent output:
1. Always use `<MarkdownRenderer content={agentOutput} />` from `@papaya/shared-ui`
2. Never render agent markdown with raw HTML injection — agent output is untrusted and must go through `MarkdownRenderer` with `rehype-sanitize` enabled
3. Enable `enableMath` only for FWA analysis views

### When adding UI components:
1. Check if shadcn/ui has the primitive -> `bun ui:add <name>`
2. Cross-app component -> `libs/shared-ui/src/composites/`
3. App-specific component -> that app's `components/` or `features/<feature>/components/`
4. Re-export new shared components from `libs/shared-ui/src/index.ts`

### When modifying shared libraries:
1. Make the change in `libs/`
2. Typecheck all consuming apps
3. Never introduce breaking changes without updating all consumers

### General principles:
- **Types first** — define the data shape before writing the UI
- **Fail gracefully** — remote loads need error boundaries and loading states
- **No cross-app imports** — sharing only through `libs/` or Module Federation
- **Keep remotes thin** — heavy shared logic goes in libs

---

## Creating a New Remote App

1. Copy `apps/sample/` to `apps/<new-name>/`
2. Update `package.json`: change `name`, set portless dev script to `portless <name>.oasis vite`, add `dev:legacy` with next port
3. Update `vite.config.ts`: change federation `name`, set `server.port` to the legacy port
4. Update `index.html`: change `<title>`
5. In the shell:
   - Add remote to `shell/vite.config.ts` remotes with entry `http://<name>.oasis.localhost:1355/mf-manifest.json`
   - Add module declaration to `shell/src/vite-env.d.ts`
   - Add route to `shell/src/routes.tsx` with `RemoteLoader`
6. Run `bun install` from `platform/`
