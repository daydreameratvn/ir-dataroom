<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white" alt="Bun" />
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/Hasura-1EB4D4?logo=hasura&logoColor=white" alt="Hasura" />
  <img src="https://img.shields.io/badge/AWS-232F3E?logo=amazonaws&logoColor=white" alt="AWS" />
  <img src="https://img.shields.io/badge/Pulumi-8A3391?logo=pulumi&logoColor=white" alt="Pulumi" />
  <img src="https://img.shields.io/badge/Claude_Code-D97706?logoColor=white" alt="Claude Code" />
</p>

# Banyan

**Monorepo for Papaya Insurtech** — AI-powered claims automation and fraud detection for insurance markets in Thailand and Vietnam.

> The **banyan** (*Ficus benghalensis*) is sacred across Southeast Asia. A single tree sends aerial roots down from its branches, each one becoming a new trunk — until what started as one tree becomes an entire forest, connected underground. In Thailand it is the **ton grai** (ต้นไกร), a symbol of shelter and resilience. In Vietnam it is the **cay da** (cay da), standing at the heart of every village.
>
> This repo works the same way. Agents, platform, mobile, SDKs, infrastructure — separate trunks, one root system.

Banyan brings together the full product stack: AI agents, a micro frontend web platform, a mobile app, partner SDKs, a GraphQL API layer, and cloud infrastructure — all in one place.

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Partner SDKs                    │
                    │   Node  ·  React  ·  RN  ·  iOS  ·  Android │
                    └──────────────────┬──────────────────────────┘
                                       │
         ┌─────────────┐        ┌──────┴──────┐        ┌──────────────┐
         │   Mobile     │        │   Platform   │        │   Agents     │
         │  (Expo RN)   │        │  (Micro FE)  │        │  (AI/LLM)    │
         └──────┬──────┘        └──────┬──────┘        └──────┬───────┘
                │                      │                      │
                └──────────────┬───────┘                      │
                               │                              │
                        ┌──────┴──────┐                       │
                        │   Hasura    │◄──────────────────────┘
                        │  DDN (v3)   │
                        └──────┬──────┘
                               │
                        ┌──────┴──────┐
                        │  PostgreSQL  │
                        │   (RDS)     │
                        └─────────────┘
```

---

## Repo Structure

```
banyan/
├── agents/          AI agents — Claude-powered claim adjudication & FWA detection
├── platform/        Web frontend — Vite micro frontend with Module Federation
├── mobile/          Mobile app — Expo + React Native (iOS & Android)
├── sdks/            Partner SDKs — Node, React, React Native, Swift, Kotlin
├── hasura/          GraphQL API — Hasura DDN v3 metadata & migrations
├── rootstock/       Infrastructure — Pulumi IaC for AWS (VPC, RDS, ECS, ALB)
├── scripts/         Tooling — onboard script, CI helpers
└── CLAUDE.md        AI coding guidelines for Claude Code
```

---

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org) | >= 20 | Server runtime |
| [Bun](https://bun.sh) | Latest | Package manager & local runtime |
| [Git](https://git-scm.com) | Latest | Version control |
| [Claude Code](https://claude.ai) | Latest | AI coding assistant (optional) |

### Quick Start

```bash
# Clone
git clone git@github.com:papaya-insurtech/banyan.git && cd banyan

# Run the onboard script — checks tools, installs deps, verifies compilation
bash scripts/onboard.sh
```

The onboard script will:
- Install Claude Code if missing and check authentication
- Verify Node.js, Bun, Git, and optional tools (tsgo, EAS CLI, Watchman)
- Install dependencies for root, platform, and mobile workspaces
- Run typecheck to confirm everything compiles

### Manual Setup

```bash
# Root dependencies
bun install

# Platform (web frontend)
cd platform && bun install

# Mobile (React Native)
cd mobile && bun install

# SDKs
cd sdks && bun install
```

---

## Workspaces

### Platform — `platform/`

Micro frontend architecture using [Module Federation 2.0](https://module-federation.io). A host shell loads remote apps at runtime — each remote works standalone or embedded.

```
platform/
├── apps/
│   ├── shell/          MF host — sidebar, auth, layout (port 3000)
│   └── sample/         MF remote template — copy to create new apps (port 3001)
├── libs/
│   ├── shared-ui/      shadcn/ui components + composites (DataTable, MarkdownRenderer)
│   ├── shared-types/   TypeScript interfaces for API contracts
│   └── api-client/     HTTP client for Hasura/backend
```

```bash
cd platform

bun run dev              # Start all apps
bun run dev:shell        # Start shell only
bun run build            # Build everything
bun run typecheck        # Type check all packages
bun ui:add <component>   # Add a shadcn/ui component
```

**Key patterns:**
- Async bootstrap (`main.tsx → import('./bootstrap')`) for MF shared module negotiation
- Remotes use `createMemoryRouter` when embedded to avoid routing conflicts
- All AI agent output rendered through `<MarkdownRenderer>` composite
- Tailwind CSS 4 with shadcn/ui (New York style, Zinc palette)

**Creating a new remote app:** Copy `apps/sample/`, update the name in `package.json` and `vite.config.ts`, wire it into the shell. See `platform/CLAUDE.md` for the full checklist.

---

### Mobile — `mobile/`

[Expo](https://expo.dev) React Native app with file-based routing via Expo Router.

```bash
cd mobile

bun start              # Start Expo dev server
bun run ios            # Run on iOS simulator
bun run android        # Run on Android emulator
bun run typecheck      # Type check
```

---

### SDKs — `sdks/`

Partner-facing SDKs organized by platform. Each platform directory can hold multiple named SDKs — the `sample/` in each serves as a template.

```
sdks/
├── node/sample/              @papaya/sample           (core client)
├── react/sample/             @papaya/sample-react     (hooks + provider)
├── react-native/sample/      @papaya/sample-react-native
├── ios/sample/               Swift Package
└── android/sample/           Kotlin + Gradle
```

```bash
cd sdks

bun install            # Install all TS SDK deps
bun run typecheck      # Type check all TS SDKs
bun run build          # Build all TS SDKs
```

**Creating a new SDK:** Copy `node/sample/` to `node/<name>/`, update the package name. If you need React/RN variants, copy those too and update the dependency. See `sdks/CLAUDE.md`.

---

### Agents — `agents/`

AI agents powered by the Claude API. Deployed to AWS Lambda / Step Functions / ECS via SST.

Each agent follows the tool-calling loop pattern: **reason → call tool → observe → repeat**. Agents access the database exclusively through the Hasura GraphQL API — never raw SQL.

---

### Hasura — `hasura/`

[Hasura DDN v3](https://hasura.io/ddn) metadata and database migrations. Provides the GraphQL API layer between agents/frontend and PostgreSQL.

```bash
# From repo root
bun run hasura:start            # Start local Hasura
bun run hasura:migrate           # Run pending migrations
bun run hasura:migrate:new       # Create a new migration
bun run hasura:introspect        # Introspect database schema
bun run hasura:tunnel            # Open SSM tunnel to RDS
```

**Migration rules:** Only additive changes (new tables, columns, indexes). Never drop, rename, or change types in-place. See `hasura/CLAUDE.md`.

---

### Infrastructure — `rootstock/`

AWS infrastructure defined with [Pulumi](https://www.pulumi.com) (TypeScript). Deploys to `ap-southeast-1` (Singapore).

| Resource | Details |
|----------|---------|
| **Networking** | VPC `10.68.0.0/16`, 2 AZs, 6 subnets (public/private/isolated) |
| **Database** | RDS PostgreSQL 16, `db.t4g.medium`, 50GB gp3 |
| **Compute** | ECS Fargate — Hasura v3 Engine + NDC Postgres connector |
| **Load Balancer** | ALB with HTTPS (TLS 1.3) |
| **Service Discovery** | AWS Cloud Map (`ddn.internal`) |
| **Access** | SSM Session Manager (no SSH) |
| **Auth** | JWT (HS256) via Secrets Manager |

---

## Coding with Claude Code

This repo is designed for AI-assisted development with [Claude Code](https://claude.ai/claude-code). Every major directory has a `CLAUDE.md` file with domain-specific rules that Claude Code auto-loads.

```
CLAUDE.md                    Root — monorepo conventions, backward compatibility, git safety
├── agents/CLAUDE.md         Agent development patterns
├── hasura/CLAUDE.md         Migration and permission rules
├── platform/CLAUDE.md       Micro frontend architecture, MF patterns, UI system
├── mobile/CLAUDE.md         Expo + React Native patterns
└── sdks/CLAUDE.md           SDK structure, naming, publishing
```

---

## Key Principles

**Backward Compatibility** — All changes must be backward compatible for zero-downtime deployments. Add new, keep old, then remove old after verification.

**Work Scope Isolation** — Each workspace is self-contained. When working in `platform/`, don't touch `agents/`. Each `CLAUDE.md` defines its boundary.

**Types First** — Define the data shape before writing UI or business logic. All API responses are fully typed.

---

## License

Proprietary. All rights reserved by Papaya Insurtech.
