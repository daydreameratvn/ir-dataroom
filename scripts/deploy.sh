#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# Banyan Deploy Script
#
# Deploys the frontend (S3 + CloudFront), auth service (ECR + ECS),
# investor portal (S3 + CloudFront), and phoenix (S3 + CloudFront).
# Usage: AWS_PROFILE=banyan bash scripts/deploy.sh [frontend|auth|investor-portal|phoenix|all]
# =============================================================

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="ap-southeast-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
TARGET="${1:-all}"

echo "=== Banyan Deploy ==="
echo "Account: $ACCOUNT_ID"
echo "Region:  $REGION"
echo "Target:  $TARGET"
echo ""

# =============================================================
# Deploy Auth Service
# =============================================================
deploy_auth() {
  echo ">>> Building auth Docker image..."
  local ECR_URL="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/banyan-auth"
  echo "ECR: $ECR_URL"

  # Login to ECR
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

  # Build from repo root (Dockerfile references auth/, agents/, and platform/)
  docker build --platform linux/amd64 -t "$ECR_URL:latest" -f "$REPO_ROOT/auth/Dockerfile" "$REPO_ROOT"

  echo ">>> Pushing to ECR..."
  docker push "$ECR_URL:latest"

  echo ">>> Forcing ECS service update..."
  aws ecs update-service \
    --cluster banyan-prod-cluster \
    --service banyan-prod-auth-service \
    --force-new-deployment \
    --region "$REGION" \
    --query 'service.serviceName' --output text

  echo ">>> Auth deployed. ECS will roll out new tasks."
}

# =============================================================
# Deploy Frontend
# =============================================================
deploy_frontend() {
  echo ">>> Building frontend..."
  cd "$REPO_ROOT/platform"
  bun install
  bun run build

  local BUCKET="banyan-prod-frontend"
  local CF_ID="E1SZ4G9NL7U0ZA"

  echo ">>> Uploading to S3 ($BUCKET)..."
  # Shell app is the main frontend build output
  aws s3 sync "$REPO_ROOT/platform/apps/shell/dist/" "s3://$BUCKET/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --region "$REGION"

  # index.html should not be cached
  aws s3 cp "$REPO_ROOT/platform/apps/shell/dist/index.html" "s3://$BUCKET/index.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    --region "$REGION"

  echo ">>> Invalidating CloudFront ($CF_ID)..."
  aws cloudfront create-invalidation \
    --distribution-id "$CF_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' --output text

  echo ">>> Frontend deployed at https://oasis.papaya.asia"
}

# =============================================================
# Deploy Investor Portal
# =============================================================
deploy_investor_portal() {
  echo ">>> Building investor portal..."
  cd "$REPO_ROOT/platform/apps/investor-portal"
  bun install
  bun run build

  local BUCKET="banyan-prod-investor-portal"
  local CF_ID="EEUHUMTGQZFGL"

  echo ">>> Uploading to S3 ($BUCKET)..."
  aws s3 sync "$REPO_ROOT/platform/apps/investor-portal/dist/" "s3://$BUCKET/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --region "$REGION"

  # index.html should not be cached
  aws s3 cp "$REPO_ROOT/platform/apps/investor-portal/dist/index.html" "s3://$BUCKET/index.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    --region "$REGION"

  echo ">>> Invalidating CloudFront ($CF_ID)..."
  aws cloudfront create-invalidation \
    --distribution-id "$CF_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' --output text

  echo ">>> Investor portal deployed at https://investors.papaya.asia"
}

# =============================================================
# Deploy Phoenix
# =============================================================
deploy_phoenix() {
  echo ">>> Building phoenix..."
  cd "$REPO_ROOT/platform/apps/phoenix"
  bun install
  bun run build

  local BUCKET="banyan-prod-phoenix"
  local CF_ID="E2KVO0UGOW295V"

  echo ">>> Uploading to S3 ($BUCKET)..."
  aws s3 sync "$REPO_ROOT/platform/apps/phoenix/dist/" "s3://$BUCKET/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --region "$REGION"

  # index.html should not be cached
  aws s3 cp "$REPO_ROOT/platform/apps/phoenix/dist/index.html" "s3://$BUCKET/index.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html" \
    --region "$REGION"

  echo ">>> Invalidating CloudFront ($CF_ID)..."
  aws cloudfront create-invalidation \
    --distribution-id "$CF_ID" \
    --paths "/*" \
    --query 'Invalidation.Id' --output text

  echo ">>> Phoenix deployed at https://phoenix.papaya.asia"
}

# =============================================================
# Run
# =============================================================
case "$TARGET" in
  auth)
    deploy_auth
    ;;
  frontend)
    deploy_frontend
    ;;
  investor-portal)
    deploy_investor_portal
    ;;
  phoenix)
    deploy_phoenix
    ;;
  all)
    deploy_auth
    deploy_frontend
    deploy_investor_portal
    deploy_phoenix
    ;;
  *)
    echo "Usage: $0 [frontend|auth|investor-portal|phoenix|all]"
    exit 1
    ;;
esac

echo ""
echo "=== Deploy complete ==="
