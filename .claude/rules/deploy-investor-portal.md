---
description: Investor portal deployment to production (S3 + CloudFront)
paths:
  - "platform/apps/investor-portal/**"
  - "scripts/deploy.sh"
---

# Deploy Investor Portal

Production URL: `https://investors.papaya.asia`
Deploy command: `AWS_PROFILE=banyan bash scripts/deploy.sh investor-portal`

Load the `deploy-investor-portal` skill when:
- Deploying investor portal to production
- Troubleshooting a failed investor portal deployment
- Needing to understand the investor portal infrastructure (S3, CloudFront, ALB)

Skip the `deploy-investor-portal` skill when:
- Only making code changes without deploying
- Running local dev server (`bun run dev`)
- Working on other apps (phoenix, shell, auth)
