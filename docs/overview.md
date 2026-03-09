# Banyan — Architecture Overview

Banyan is the monorepo for **Papaya**, a hyperscale insurance infrastructure platform. It spans cloud infrastructure, AI agents, a GraphQL data layer, a micro frontend web platform, a mobile app, and partner SDKs — designed to support every country, every insurance product, every line of business.

**Primary region**: `ap-southeast-1` (Singapore)

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             CLIENTS                                     │
│   Browser (Platform)  │  Mobile App (Expo)  │  Partner SDKs (5 targets) │
└──────────┬────────────┴─────────┬───────────┴──────────┬────────────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          EDGE / CDN                                     │
│   CloudFront ──► S3 (static frontend assets)                            │
│   CloudFront ──► Hasura DDN Cloud (GraphQL reverse proxy)               │
└──────────┬──────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               ALB  (prod.banyan.services.papaya.asia)                   │
│                                                                         │
│   /auth/*        ──► Auth Service      (ECS Fargate, Hono)              │
│   /forensics/*   ──► Doc Forensics     (ECS Fargate CPU / GPU EC2)      │
└──────────┬──────────────────────┬───────────────────────────────────────┘
           │                      │
           ▼                      ▼
┌────────────────────┐   ┌────────────────────────────────────────────────┐
│   Hasura DDN       │   │              AI AGENTS (ECS / Lambda)          │
│   Cloud (v3)       │   │                                                │
│                    │   │   drone (orchestrator)  │  claim-assessor      │
│   ~35 tables       │   │   scourge (FWA)         │  document-forensics  │
│   140+ HML files   │   │   compliance            │  overseer            │
│   GraphQL API      │   │   portal-* agents (6)   │  subagents/*         │
│   JWT HS256 auth   │   │                                                │
│                    │   │   Framework: pi-mono (pi-ai + pi-agent-core)   │
└──────────┬─────────┘   │   LLM: Claude Sonnet/Opus via AWS Bedrock     │
           │             │   Vision: Gemini API + TruFor (PyTorch)        │
           ▼             └──────────────┬─────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                     │
│                                                                         │
│   NLB (TCP 5432) ──► RDS PostgreSQL 17 (db.t4g.medium, 50GB gp3)       │
│                            │                                            │
│                            ├──► Doltgres replica (EFS-backed)           │
│                            │    Git-like audit: dolt_log, dolt_diff      │
│                            │                                            │
│                            └──► dbmate migrations (hasura/db/)          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Layers

### 1. Infrastructure — `rootstock/`

**Pulumi (TypeScript)** managing permanent AWS + GCP resources.

| Resource | Detail |
|----------|--------|
| VPC | `10.68.0.0/16`, 2 AZs (`1a`, `1b`), public / private / isolated subnets |
| RDS | PostgreSQL 17, `db.t4g.medium`, 50 GB gp3, isolated subnets, logical replication |
| Doltgres | Fargate + EFS — Git-backed Postgres replica for time-travel audit queries |
| ALB | HTTPS on `prod.banyan.services.papaya.asia`, routes `/auth/*` and `/forensics/*` |
| NLB | Internet-facing TCP 5432, connects Hasura DDN Cloud to RDS via SSL |
| ECS Fargate | Auth service (2 tasks, 256 CPU / 512 MB), Forensics (1 task, 2048 CPU / 8 GB) |
| ECS EC2 | Forensics GPU (`g4dn.xlarge`, NVIDIA T4), scale-to-zero |
| CloudFront | Static frontend hosting (S3 + OAC), Hasura DDN reverse proxy |
| Bastion | `t4g.nano`, SSM-only (no SSH), port-forwarding to RDS and Doltgres |
| ECR | `banyan-auth`, `banyan-document-forensics`, `banyan-document-forensics-gpu` |
| GCP | Project `banyan-489002` — Google Workspace SSO (Admin SDK, People API) |
| S3 | `banyan-portal-documents` (claims uploads), `banyan-prod-frontend`, `banyan-prod-phoenix` |

**IaC state**: S3 backend (`s3://banyan-pulumi-state-bucket`), stack: `prod`.

**Monthly baseline**: ~$305 (Forensics Fargate 28%, RDS 26%, NAT Gateway 14%, Doltgres 12%, ALB 8%, NLB 6%).

```
rootstock/
├── index.ts               # Entry point + stack outputs
├── config.ts              # Pulumi config values
├── providers/             # aws.ts, gcp.ts
└── resources/             # vpc, rds, ecs-auth, ecs-forensics, ecs-forensics-gpu,
                           # alb, nlb, doltgres, jwt, acm, phoenix, hasura-proxy
```

---

### 2. Data Layer — `hasura/`

**Hasura DDN Cloud v3 (managed)** serving GraphQL over PostgreSQL.

- NDC PostgreSQL connector reaches RDS through the NLB
- ~35 tables modeled across 140+ HML metadata files (Models, ObjectTypes, Relationships, Commands, Permissions)
- **Auth**: JWT HS256 — `Authorization: Bearer <token>`
- **Roles**: `admin`, `executive`, `manager`, `staff`, `viewer` — row-level security via `x-hasura-user-id`, `x-hasura-tenant-id`
- **Migrations**: SQL files in `hasura/db/migrations/`, applied with `dbmate`
- **Deploy cycle**: `ddn connector introspect` → edit HML → `ddn supergraph build create --apply`

**Mandatory table convention**: Every table includes 6 audit columns — `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`, `deleted_by`. Soft-delete only, never hard-delete.

---

### 3. Auth Service — `auth/`

**Hono (TypeScript)** on ECS Fargate, behind ALB at `/auth/*`.

| Capability | Detail |
|------------|--------|
| SSO | Google, Microsoft, Apple OAuth |
| OTP | Email (SES) / SMS (SNS) |
| Passkeys | WebAuthn via `@simplewebauthn/server` |
| Tokens | JWT issuance, refresh, session management |
| Portal | Claims document management (S3 upload/download proxy) |
| IR Portal | Investor relations — documents, NDAs, watermarking (`sharp`, `pdf-lib`) |
| Phoenix | Phoenix portal routes |
| Directory | Google Workspace directory sync |
| AI Proxy | Fatima assistant integration, drone/FWA claim proxying |

---

### 4. AI Agents — `agents/`

**pi-mono** framework (`pi-ai` + `pi-agent-core` + `pi-coding-agent`) with Claude via AWS Bedrock.

| Agent | Role |
|-------|------|
| `drone` | Orchestrator — dispatches to specialist agents |
| `claim-assessor` | Full claim adjudication (policy rules, compliance, medical necessity) |
| `claim-submission` | Claim intake and submission processing |
| `scourge` | FWA (fraud, waste, abuse) detection pipeline |
| `document-forensics` | Document forgery detection (TruFor + Gemini Vision + EasyOCR/Gemini OCR) |
| `document-compliance` | Document compliance checking |
| `compliance` | General compliance analysis |
| `overseer` | Monitoring and oversight |
| `portal-*` | 6 portal-facing specialists (assessment, extraction, FWA, image forensics, medical necessity, pre-existing) |
| `subagents/` | Generic `runSubAgent()` runner wrapping pi-agent-core's Agent class |

**LLM models** (AWS Bedrock, cross-region inference):

| Model | ID |
|-------|----|
| Claude Opus 4.6 | `global.anthropic.claude-opus-4-6-v1` |
| Claude Sonnet 4.6 | `global.anthropic.claude-sonnet-4-6` |
| Claude Haiku 4.5 | `global.anthropic.claude-haiku-4-5-20251001-v1:0` |

**Document Forensics** runs as a standalone Bun HTTP server (port 4001) with endpoints for `/forensics/analyze`, `/forensics/batch`, `/forensics/extract`. Uses a Python bridge for the TruFor neural network and Gemini Vision for semantic analysis. Deployed as both CPU (Fargate) and GPU (EC2 `g4dn.xlarge`) variants.

---

### 5. Frontend Platform — `platform/`

**React 18 + Vite 6 + Module Federation 2.0** micro frontend architecture.

```
platform/
├── apps/
│   ├── shell/              # Host — navigation, auth, layout, lazy-loads remotes
│   ├── investor-portal/    # Remote: IR portal
│   ├── phoenix/            # Remote: Phoenix portal
│   └── sample/             # Template for new remote apps
└── libs/
    ├── shared-ui/          # shadcn/ui primitives + Papaya composites
    ├── shared-types/       # Common TypeScript types
    ├── api-client/         # GraphQL/REST API client
    ├── auth/               # Auth integration
    └── i18n/               # Internationalization
```

- **Shell** is the host — loads remote apps dynamically at runtime via Module Federation
- Each remote exposes an `entry.tsx` module, wrapped by `RemoteLoader.tsx` (Suspense + ErrorBoundary)
- Remotes can run standalone or embedded in the shell

| Concern | Library |
|---------|---------|
| State (local) | Zustand |
| State (server) | TanStack Query v5 |
| Routing | React Router v7 |
| Tables | TanStack Table v8 |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui |
| Charts | Recharts |
| Markdown | react-markdown + remark-gfm + shiki + rehype-sanitize |
| Testing | Vitest + React Testing Library |

Deployed as static assets to S3 (`banyan-prod-frontend`) via CloudFront.

---

### 6. Mobile App — `mobile/`

**React Native 0.76 + Expo SDK 52** — single codebase for iOS and Android.

- **Navigation**: Expo Router (file-based routing, `app/` directory)
- **State**: Zustand (local) + TanStack Query (server)
- **Build/OTA**: EAS Build + EAS Update
- **Styling**: `StyleSheet.create()`, tokens in `constants/Colors.ts`
- **Offline**: `expo-sqlite` / AsyncStorage with sync-on-reconnect
- **Screens**: Dashboard, Claims, Settings

---

### 7. Partner SDKs — `sdks/`

Multi-platform integration libraries published to AWS CodeArtifact (`papaya` domain, `ap-southeast-1`).

```
TypeScript dependency chain:

  sdks/node/<name>                 @papaya/<name>          ← core HTTP client
    ├── sdks/react/<name>          @papaya/<name>-react    ← React hooks + context
    └── sdks/react-native/<name>   @papaya/<name>-react-native  ← RN-specific

Native SDKs (standalone, no TS dependency):

  sdks/ios/<name>                  Swift, Swift Package Manager
  sdks/android/<name>              Kotlin, Ktor, Maven Central
```

---

### 8. Shared Packages — `packages/`

| Package | Purpose |
|---------|---------|
| `@papaya/graphql` | Thin shim wrapping `@apollo/client`'s `gql` tag with fragment merging |

---

## CI/CD — `.github/workflows/`

| Workflow | Trigger | Action |
|----------|---------|--------|
| `test.yml` | PRs + pushes to `main` | Path-filtered typecheck + tests for `platform/` and `sdks/` |
| `ddn-deploy.yml` | Pushes to `main` (hasura paths) | Fetch SSM secrets → `ddn supergraph build create --apply` |
| `dependency-audit.yml` | Weekly (Monday 2am ICT) | `bun outdated` + `bun audit` across all workspaces |

**Auth**: GitHub Actions OIDC → IAM role assumption (no static access keys).

---

## Cross-Cutting Patterns

### Secrets Management

All secrets live in AWS SSM Parameter Store (`SecureString`) or Secrets Manager. `.env` files are gitignored and generated by scripts pulling from SSM.

| Namespace | Contents |
|-----------|----------|
| `/banyan/hasura/` | JWT key, DB URIs, admin token, NLB/DDN endpoints |
| `/banyan/auth/` | OAuth client credentials (Google, Microsoft, Apple) |
| `/banyan/forensics/` | Gemini API key |
| `/banyan/pulumi/` | Pulumi config passphrase |

### Backward Compatibility

Zero-downtime deployments enforced via: **add new alongside old → controlled switchover → remove old after verification**. Database schema changes are additive-only — no drops, renames, or in-place type changes.

### Audit Trail

Every database table carries 6 audit columns (`created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`, `deleted_by`). Doltgres replicates all writes into a Git-like structure, enabling `dolt_log`, `dolt_diff`, branching, and time-travel queries.

### Runtime & Tooling

| Concern | Tool |
|---------|------|
| Package manager | Bun |
| Local runtime | Bun |
| Server runtime | Node.js (deployed) |
| TypeScript compiler | tsgo (falls back to tsc) |
| IaC (permanent) | Pulumi |
| IaC (application) | SST |
| Testing | Red/Green TDD, Vitest |
