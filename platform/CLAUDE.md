# Platform — Micro Frontend Architecture

## Identity

You are the lead architect and developer for Papaya's frontend platform. This workspace contains a modular micro frontend with a host shell and pluggable remote apps. AI agents generate rich markdown output that the platform must render beautifully.

The `sample` remote app serves as a template for creating new remote apps. Copy it to create new apps with the correct Module Federation, routing, and styling setup already in place.

---

## Tech Stack

| Layer              | Choice                                      |
| ------------------ | ------------------------------------------- |
| Build              | Vite 6+                                     |
| UI Framework       | React 18+ with TypeScript (strict mode)     |
| Type Checking      | TypeScript Go (tsgo) when available; falls back to tsc |
| Base Components    | shadcn/ui (copy-paste, not installed as dep) |
| Icons              | Lucide React                                |
| Styling            | Tailwind CSS 4                              |
| Linting            | ESLint flat config + Prettier               |
| Package Manager    | Bun with workspaces                         |
| Node               | v20 LTS minimum                             |
| Micro FE Runtime   | Module Federation 2.0 (`@module-federation/vite`) |
| Data Tables        | TanStack Table v8                           |
| Charts             | Recharts                                    |
| Markdown Rendering | react-markdown + remark-gfm + shiki + rehype-sanitize |
| Prose Styling      | @tailwindcss/typography                     |
| Local State        | Zustand                                     |
| Server State       | TanStack Query v5                           |
| Routing            | React Router v7                             |
| Testing            | Vitest + React Testing Library              |

---

## Folder Structure

```
platform/
├── CLAUDE.md
├── package.json                       # Root — bun workspaces + scripts
├── tsconfig.base.json                 # Shared strict TS config
├── components.json                    # shadcn/ui config → libs/shared-ui
│
├── apps/
│   ├── shell/                         # Host app — navigation, auth, layout
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── vite.config.ts             # Module Federation HOST config
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx               # import('./bootstrap') for async MF loading
│   │       ├── bootstrap.tsx          # createRoot + RouterProvider
│   │       ├── App.tsx                # Sidebar + topbar + content slot
│   │       ├── routes.tsx             # Lazy loads remotes
│   │       ├── components/
│   │       │   ├── RemoteLoader.tsx   # Suspense + ErrorBoundary for remotes
│   │       │   └── ErrorBoundary.tsx
│   │       └── vite-env.d.ts          # Module declarations for remotes
│   │
│   └── sample/                        # Template remote — copy to create new apps
│       ├── package.json
│       ├── index.html                 # Standalone entry
│       ├── vite.config.ts             # Module Federation REMOTE config
│       ├── tsconfig.json
│       └── src/
│           ├── main.tsx               # import('./bootstrap') for async MF loading
│           ├── bootstrap.tsx          # Standalone createRoot
│           ├── entry.tsx              # EXPOSED MODULE — shell imports this
│           ├── App.tsx
│           └── routes.tsx
│
├── libs/
│   ├── shared-ui/                     # shadcn primitives + Papaya composites
│   │   ├── package.json               # "name": "@papaya/shared-ui"
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts               # Barrel export
│   │       ├── globals.css            # CSS variables for shadcn theming
│   │       ├── components/
│   │       │   └── ui/                # shadcn/ui generated components
│   │       ├── composites/            # Papaya business components
│   │       │   ├── DataTable/
│   │       │   └── MarkdownRenderer/
│   │       └── lib/
│   │           └── utils.ts           # cn() helper
│   │
│   ├── shared-types/
│   │   ├── package.json               # "name": "@papaya/shared-types"
│   │   └── src/
│   │
│   └── api-client/
│       ├── package.json               # "name": "@papaya/api-client"
│       └── src/
```

---

## Module Federation

### Async Bootstrap Pattern (Required for All Apps)

```
main.tsx → import('./bootstrap') → bootstrap.tsx → createRoot
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

The platform uses [portless](https://github.com/vercel-labs/portless) to replace port numbers with stable `.localhost` URLs. The proxy runs on port 1355 and auto-starts when any app runs.

| App    | Portless URL                           | Legacy Port |
| ------ | -------------------------------------- | ----------- |
| shell  | `http://oasis.localhost:1355`          | 3000        |
| sample | `http://sample.oasis.localhost:1355`   | 3001        |

New remote apps should use `<name>.oasis` as their portless name and register a `dev:legacy` script with the next available port.

To run without portless: `bun run dev:legacy` (uses hardcoded ports).

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

## Markdown Rendering (AI Agent Output)

AI agents generate markdown constantly: adjudication reports, FWA analysis summaries, rule explanations, audit trails. Markdown rendering is a first-class concern.

### MarkdownRenderer Composite

The `MarkdownRenderer` in `libs/shared-ui/src/composites/MarkdownRenderer/` is the single place all agent markdown is rendered. Every place in the platform that displays AI-generated text MUST use this component.

### Rules

- **Always use `MarkdownRenderer`** — never call `react-markdown` directly in feature code
- **Always enable `rehype-sanitize`** — agent output is untrusted
- **Math is opt-in** — only enable `enableMath` for views with financial formulas (adds ~200KB)
- **Streaming support** — `MarkdownRenderer` handles partial markdown gracefully (incomplete tables, unclosed code blocks)
- **Dark mode** — prose classes and shiki theme must respect dark/light toggle

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

---

## Scripts (Root package.json)

```json
{
  "dev": "bun run --filter './apps/*' dev",
  "dev:shell": "bun run --filter shell dev",
  "dev:legacy": "bun run --filter './apps/*' dev:legacy",
  "build": "bun run --filter './libs/*' build && bun run --filter './apps/*' build",
  "test": "bun run --filter '*' test",
  "lint": "bun run --filter '*' lint",
  "typecheck": "bun run --filter '*' typecheck",
  "ui:add": "cd libs/shared-ui && bunx shadcn@latest add"
}
```

- `dev` — starts all apps via portless (stable `.localhost` URLs)
- `dev:legacy` — starts all apps with hardcoded ports (no portless)
- `dev:shell` — starts only the shell via portless

---

## Testing

Follow the red/green TDD protocol defined in the root `CLAUDE.md`. Platform-specific conventions:

- **Framework**: Vitest + React Testing Library
- **File naming**: `ComponentName.test.tsx` next to the source file
- **Mocking**: `vi.mock()` for modules, `userEvent.setup()` for interactions
- **Async**: `waitFor()` for async operations, `screen.findBy*` for elements that appear later
- **Globals**: Vitest globals enabled — no need to import `describe`, `it`, `expect`
- **TypeScript**: Strict — use `!` for indexing, avoid `any`
- **Run**: `cd platform && bun run test` (runs all workspace tests)

## Workflow Rules for Claude Code

### When displaying AI agent output:
1. Always use `<MarkdownRenderer content={agentOutput} />` from `@papaya/shared-ui`
2. Never render agent markdown with raw `dangerouslySetInnerHTML`
3. Enable `enableMath` only for FWA analysis views

### When adding UI components:
1. Check if shadcn/ui has the primitive → `bun ui:add <name>`
2. Cross-app component → `libs/shared-ui/src/composites/`
3. App-specific component → that app's `components/` or `features/<feature>/components/`
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

## Work Scope

When working in this folder, only reference:
- Files within `platform/`
- Root `tsconfig.json` if relevant

Do not read or modify files in `sdks/`, `mobile/`, `agents/`, `hasura/`, or `rootstock/`.
