# Portal Migration Status

**Last updated**: 2026-03-02
**Branch**: `feat/portal` (9 commits ahead of main)

## Completed Phases

### Phase 0+1: Scaffold & Route Registration + Types + API Client
- `platform/apps/shell/src/features/portal/PortalPage.tsx` — Root page with nested Routes
- `platform/apps/shell/src/features/portal/types.ts` — All portal types
- `platform/apps/shell/src/features/portal/api.ts` — 14 API functions, base path `/auth/portal`
- `platform/apps/shell/src/features/portal/hooks/usePortalConfig.ts` — Zustand store
- `platform/apps/shell/src/routes.tsx` — Added portal route
- `platform/apps/shell/src/config/navigation.ts` — Added portal nav item
- `platform/apps/shell/src/components/AppSidebar.tsx` — Added ScanSearch icon

### Phase 2: Dashboard + Claims List + New Claim
- `features/portal/components/ClaimStatusBadge.tsx`
- `features/portal/components/DashboardView.tsx`
- `features/portal/components/ClaimsList.tsx`
- `features/portal/components/NewClaimForm.tsx`
- `features/portal/hooks/useDashboardStats.ts`
- `features/portal/hooks/usePortalClaims.ts`

### Phase 3: Claim Detail — Overview + Document Viewer
- `features/portal/components/ClaimDetail.tsx` — 35/65 split layout
- `features/portal/components/OverviewTab.tsx`
- `features/portal/components/DocumentViewer.tsx`
- `features/portal/components/ProcessTimeline.tsx`
- `features/portal/hooks/usePortalClaim.ts` — Auto-polling hook

### Phase 4: Agent Workspaces + Backend
- **Backend**: `auth/src/routes/portal.ts` — 17 Hono endpoints (CRUD + SSE streaming)
- **Backend registered**: `auth/src/index.ts` — `app.route("/auth", portal)`
- **Agents**:
  - `agents/portal-extraction/agent.ts` + `tools/claims.ts`
  - `agents/portal-assessment/agent.ts` + `tools/assessment.ts`
  - `agents/portal-medical-necessity/agent.ts`
  - `agents/portal-fwa/agent.ts`
- **Frontend streaming**:
  - `features/portal/hooks/useAgentStream.ts`
  - `features/portal/components/AgentWorkspace.tsx`
  - `ClaimDetail.tsx` updated to use AgentWorkspace for all 4 tabs

### Phase 5: Analytics, FWA Cases, Settings
- `features/portal/components/AnalyticsView.tsx` — Recharts
- `features/portal/components/FWAAnalyticsView.tsx`
- `features/portal/components/FWACasesList.tsx`
- `features/portal/components/FWACaseDetail.tsx`
- `features/portal/components/SettingsView.tsx`
- `features/portal/hooks/usePortalAnalytics.ts`
- `features/portal/hooks/useFWACases.ts`
- `platform/apps/shell/package.json` — Added `recharts` dependency

### Phase 6A: Database Migration
- `hasura/db/migrations/20260302010000_add_portal_columns_to_claims.sql`
- Adds 15 columns to `claims` table (claim_type, extracted_data JSONB, admission/discharge dates, etc.)
- Creates `fwa_cases`, `fwa_case_actions`, `fwa_case_linked_claims` tables
- Adds 2 new claim statuses (pending, error)

### Phase 6C: Feature Flag
- `platform/libs/shared-types/src/tenant.ts` — Added `portal: boolean` to `TenantFeatures`
- `platform/apps/shell/src/providers/TenantProvider.tsx` — Added `portal: true` to defaults
- `platform/apps/shell/src/config/navigation.ts` — Added `requiredFeature: 'portal'`

### Phase 6D: i18n Translations
- Added `nav.portal` + `portal.*` section (~80 keys) to all 4 locales:
  - `platform/libs/i18n/src/locales/en.ts`
  - `platform/libs/i18n/src/locales/th.ts`
  - `platform/libs/i18n/src/locales/zh.ts`
  - `platform/libs/i18n/src/locales/vi.ts`

### Phase 6E: Hasura DDN Metadata (COMPLETED)
- 11 new HML files in `hasura/ddn/app/metadata/`:
  - `FwaCases.hml` — ObjectType, Model, Permissions, Relationships (Tenants, Actions, LinkedClaims, Statuses)
  - `InsertFwaCases.hml`, `UpdateFwaCasesById.hml`, `DeleteFwaCasesById.hml`
  - `FwaCaseActions.hml` — Model with relationship back to FwaCases
  - `InsertFwaCaseActions.hml`
  - `FwaCaseLinkedClaims.hml` — Model with relationships to FwaCases and Claims
  - `InsertFwaCaseLinkedClaims.hml`
  - `FwaCaseStatuses.hml`, `InsertFwaCaseStatuses.hml`, `DeleteFwaCaseStatusesByValue.hml`
- Updated `Claims.hml` — Added `fwaCaseLinkedClaims` array relationship

### Phase 6F: Production Backend Hardening (COMPLETED)
- `auth/src/routes/portal.ts` expanded from 774 → 1307 lines:
  - Real S3 multipart upload via `@aws-sdk/lib-storage`
  - `runPortalPipeline()` fire-and-forget: extraction → (assessment + MN parallel) → FWA
  - Analytics endpoints filled with real GraphQL aggregation queries
  - FWA cases CRUD (list, detail, create) with proper GraphQL queries
  - SSE stream rate limiter (max 5 concurrent per user, 429 on exceed)
  - Fixed SQL injection in GET /portal/claims (parameterized GraphQL variables)
  - All TODO stubs removed

### Phase 6G: Component Tests (COMPLETED)
- `ClaimStatusBadge.test.tsx` — 17 tests (all 9 statuses, 5 types, unknown/null edge cases)
- `DashboardView.test.tsx` — 5 tests (loading, stats, recent claims, empty, header)
- `ClaimsList.test.tsx` — 4 tests (loading, table data, empty, search)
- All 26 tests passing

**Typecheck**: All 8 packages pass cleanly.
**Tests**: All 26 portal tests pass.

## Remaining Work

### Deferred Items
- **6E cloud deploy**: Run `bun run hasura:deploy` to push HML metadata to DDN Cloud (needs AWS auth + DDN CLI)
- **6F dependencies**: Install `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` in auth package
- **6G additional tests**: Agent tool unit tests, backend endpoint tests, E2E tests
- **Production readiness**: Run DB migration on RDS, configure S3 bucket, set up agent infrastructure

### Local Testing Setup
- Shell dev server runs at `http://oasis.localhost:1355` (via portless)
- Auth backend needs to run on `http://localhost:4000` (Vite proxies `/auth` to it)
- Auth backend requires:
  - `DATABASE_URL` — PostgreSQL connection string (from AWS SSM: `banyan-prod-db-credentials`)
  - `JWT_SECRET_KEY` — JWT HMAC key (from AWS SSM: `banyan-prod-jwt-secret`)
- AWS login needed: `aws configure set region ap-southeast-1 && aws login`
- Then: `eval $(aws configure export-credentials --profile default --format env) && cd auth && bun run dev`
- User `hung@papaya.asia` must exist in the `users` table with `tenant_id = '00000000-0000-0000-0000-000000000001'`
- OTP codes are logged to the auth service console when email delivery fails locally

### To resume local testing
1. `aws login` (authenticate to AWS)
2. `eval $(aws configure export-credentials --profile default --format env)`
3. Start auth: `cd /Users/papaya/Documents/git/banyan/auth && bun run dev`
4. Start shell: `cd /Users/papaya/Documents/git/banyan/platform && bun run dev:shell`
5. Open `http://oasis.localhost:1355/portal`
6. Login with `hung@papaya.asia` (check auth console for OTP code)

## Git Log (feat/portal branch)
```
80dcb43 test(platform): add portal component tests for badges, dashboard, and claims list
aee8922 feat(hasura): add DDN metadata for FWA tables and portal claim columns
339744b feat(portal): harden backend with S3 upload, pipeline orchestration, and rate limiting
8fcd691 feat(portal): add database migration, feature flag, and i18n translations
2843743 feat(platform): add portal analytics, FWA case management, and settings
b46de66 feat(portal): add backend API, agent workspaces, and SSE streaming
23799c0 feat(platform): add claim detail view with document viewer and timeline
5ef8cf9 feat(platform): add portal dashboard, claims list, and new claim form
3ab1e2c feat(platform): add portal module scaffold with types, API client, and routing
```
