---
name: deploy-investor-portal
description: |
  Deploy the investor portal (S3 + CloudFront) to production.
  Use when: deploying investor portal, pushing investor portal changes to production, or troubleshooting investor portal deployment.
  Triggers on: "deploy investor portal", "deploy investor", "deploy to production" in context of investor-portal app, or deploy.sh with investor-portal target.
---

# Deploy Investor Portal to Production

## Architecture

- **Static SPA** hosted on S3 + CloudFront
- **S3 Bucket**: `banyan-prod-investor-portal` (ap-southeast-1)
- **CloudFront Distribution ID**: `EEUHUMTGQZFGL`
- **Custom Domain**: `https://investors.papaya.asia`
- **Auth Backend**: `/auth/*` routes to ALB (auth service on ECS)
- **SPA Routing**: CloudFront Function `banyan-investor-portal-spa-routing` rewrites non-file paths to `/index.html`

## Prerequisites

- AWS credentials configured (`AWS_PROFILE=banyan` or valid session)
- Bun installed
- All changes committed and pushed to the remote branch

## Deploy Command

```bash
AWS_PROFILE=banyan bash scripts/deploy.sh investor-portal
```

This single command handles the full pipeline:

1. **Build** — runs `bun install && bun run build` in `platform/apps/investor-portal/`
2. **Upload to S3** — syncs `dist/` to the bucket with `--delete`
   - Static assets (JS, CSS, images): `Cache-Control: public, max-age=31536000, immutable`
   - `index.html`: `Cache-Control: no-cache, no-store, must-revalidate` (always fresh)
3. **Invalidate CloudFront** — creates a `/*` invalidation so edge caches serve the new version
4. **Smoke tests** — verifies:
   - `/auth/health` returns JSON
   - SPA routing returns 200 for unknown paths
   - Portal API errors return JSON (not HTML)

## Post-Deploy Verification

After the script completes, verify manually:

1. Open `https://investors.papaya.asia/login` — should show the login page
2. Check the browser console for errors
3. Verify the change you deployed is visible

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| AWS auth error | Expired session or wrong profile | Run `aws sso login --profile banyan` or check `AWS_PROFILE` |
| Build fails | Missing deps or type errors | Run `cd platform/apps/investor-portal && bun install && bun run typecheck` |
| Old content after deploy | CloudFront cache not invalidated | Check invalidation status in AWS Console or re-run deploy |
| `/auth/*` returns HTML | CloudFront behavior misconfigured | Verify ordered behavior for `/auth/*` routes to ALB origin |

## Deploy Script Location

`scripts/deploy.sh` — the `deploy_investor_portal()` function (line ~186) contains all logic. The script also supports deploying other services: `frontend`, `auth`, `forensics`, `forensics-gpu`, `phoenix`, or `all`.
