# Platform — Micro Frontend Architecture

## Identity

You are the lead architect and developer for Papaya's frontend platform. This workspace contains a modular micro frontend with a host shell and pluggable remote apps. AI agents generate rich markdown output that the platform must render beautifully.

The `sample` remote app serves as a template for creating new remote apps. Copy it to create new apps with the correct Module Federation, routing, and styling setup already in place.

> For Module Federation setup and code conventions, the `platform-dev` skill is auto-loaded when working in this directory. For creating a new remote app, use the `new-remote-app` skill.

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
├── components.json                    # shadcn/ui config -> libs/shared-ui
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

Follow the red/green TDD protocol (`tdd` skill). Platform-specific conventions:

- **Framework**: Vitest + React Testing Library
- **File naming**: `ComponentName.test.tsx` next to the source file
- **Mocking**: `vi.mock()` for modules, `userEvent.setup()` for interactions
- **Async**: `waitFor()` for async operations, `screen.findBy*` for elements that appear later
- **Globals**: Vitest globals enabled — no need to import `describe`, `it`, `expect`
- **TypeScript**: Strict — use `!` for indexing, avoid `any`
- **Run**: `cd platform && bun run test` (runs all workspace tests)

## Work Scope

When working in this folder, only reference:
- Files within `platform/`
- Root `tsconfig.json` if relevant

Do not read or modify files in `sdks/`, `mobile/`, `agents/`, `hasura/`, or `rootstock/`.
