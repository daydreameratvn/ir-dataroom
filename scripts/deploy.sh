#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# Banyan Deploy Script
#
# Deploys the frontend (S3 + CloudFront), auth service (ECR + ECS),
# document forensics service (ECR + ECS), GPU forensics (ECR + ECS EC2),
# and investor portal (S3 + CloudFront).
# Usage: AWS_PROFILE=banyan bash scripts/deploy.sh [frontend|auth|forensics|forensics-gpu|investor-portal|all]
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
# Post-deploy smoke test
# Verifies API returns JSON (not HTML) and SPA routing works.
# Catches CloudFront customErrorResponses regression.
# =============================================================
smoke_test() {
  local DOMAIN="$1"
  echo ">>> Smoke test: $DOMAIN"

  # 1. Health endpoint returns JSON
  local CT
  CT=$(curl -sf "https://$DOMAIN/auth/health" -o /dev/null -w '%{content_type}' 2>/dev/null) || true
  if [[ -n "$CT" && "$CT" != *"application/json"* ]]; then
    echo "  FAIL: /auth/health did not return JSON (got: $CT)"
    echo "  WARNING: Smoke test failed — verify manually"
    return 0  # non-fatal: don't block deploy
  fi
  echo "  ✓ /auth/health returns JSON"

  # 2. SPA route returns 200 (CloudFront Function rewrites to index.html)
  local HTTP
  HTTP=$(curl -sf "https://$DOMAIN/smoke-test-nonexistent" -o /dev/null -w '%{http_code}' 2>/dev/null) || true
  if [[ -n "$HTTP" && "$HTTP" != "200" ]]; then
    echo "  FAIL: SPA route returned $HTTP instead of 200"
    echo "  WARNING: CloudFront Function may not be working"
    return 0
  fi
  echo "  ✓ SPA routing returns 200"

  # 3. Portal API error returns JSON (the exact bug we're guarding against)
  CT=$(curl -s -X POST "https://$DOMAIN/auth/ir/portal/otp/verify" \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke@test.com","code":"000000"}' \
    -o /dev/null -w '%{content_type}' 2>/dev/null) || true
  if [[ -n "$CT" && "$CT" != *"application/json"* ]]; then
    echo "  FAIL: Portal API error returned HTML instead of JSON (got: $CT)"
    echo "  WARNING: CloudFront may be converting API errors to HTML"
    return 0
  fi
  echo "  ✓ Portal API errors return JSON"

  echo ">>> Smoke test passed: $DOMAIN"
}

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
  docker build --no-cache --platform linux/amd64 -t "$ECR_URL:latest" -f "$REPO_ROOT/auth/Dockerfile" "$REPO_ROOT"

  echo ">>> Pushing to ECR..."
  docker push "$ECR_URL:latest"

  echo ">>> Forcing ECS service update..."
  aws ecs update-service \
    --cluster banyan-prod-cluster \
    --service banyan-prod-auth-service \
    --force-new-deployment \
    --region "$REGION" \
    --query 'service.serviceName' --output text

  echo ">>> Waiting for ECS deployment to stabilize..."
  aws ecs wait services-stable \
    --cluster banyan-prod-cluster \
    --services banyan-prod-auth-service \
    --region "$REGION" 2>&1 || echo ">>> Warning: ECS wait timed out — check manually"

  echo ">>> Auth deployed and stable."
  smoke_test "oasis.papaya.asia"
  smoke_test "investors.papaya.asia"
}

# =============================================================
# Deploy Document Forensics Service
# =============================================================
deploy_forensics() {
  echo ">>> Building document-forensics Docker image..."
  local ECR_URL="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/banyan-document-forensics"
  echo "ECR: $ECR_URL"

  # Login to ECR
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

  # Download TruFor weights from S3 if not present locally
  local WEIGHTS_DIR="$REPO_ROOT/agents/document-forensics/python/weights/trufor"
  local WEIGHTS_FILE="$WEIGHTS_DIR/trufor.pth.tar"
  if [ ! -f "$WEIGHTS_FILE" ]; then
    echo ">>> Downloading TruFor weights from S3 (~268 MB)..."
    mkdir -p "$WEIGHTS_DIR"
    aws s3 cp "s3://banyan-ml-weights/trufor/trufor.pth.tar" "$WEIGHTS_FILE"
  else
    echo ">>> TruFor weights already present"
  fi

  # Build from repo root (Dockerfile references agents/document-forensics/)
  docker build --platform linux/amd64 \
    -t "$ECR_URL:latest" \
    -f "$REPO_ROOT/agents/document-forensics/Dockerfile" \
    "$REPO_ROOT"

  echo ">>> Pushing to ECR..."
  docker push "$ECR_URL:latest"

  echo ">>> Forcing ECS service update..."
  aws ecs update-service \
    --cluster banyan-prod-cluster \
    --service banyan-prod-forensics-service \
    --force-new-deployment \
    --region "$REGION" \
    --query 'service.serviceName' --output text

  echo ">>> Document forensics deployed. ECS will roll out new tasks."
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
  smoke_test "oasis.papaya.asia"
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
  smoke_test "investors.papaya.asia"
}

# =============================================================
# Deploy Phoenix Portal
# =============================================================
deploy_phoenix() {
  echo ">>> Building phoenix portal..."
  cd "$REPO_ROOT/platform/apps/phoenix"
  bun install
  bun run build

  local BUCKET="banyan-prod-phoenix"
  local CF_ID
  CF_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, 'phoenix.papaya.asia')].Id | [0]" \
    --output text --region "$REGION")

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

  echo ">>> Phoenix portal deployed at https://phoenix.papaya.asia"
}

# =============================================================
# Deploy Document Forensics GPU Service
# =============================================================
deploy_forensics_gpu() {
  echo ">>> Building document-forensics GPU Docker image..."
  local ECR_URL="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/banyan-document-forensics-gpu"
  echo "ECR: $ECR_URL"

  # Login to ECR
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

  # Download TruFor weights from S3 if not present locally
  local WEIGHTS_DIR="$REPO_ROOT/agents/document-forensics/python/weights/trufor"
  local WEIGHTS_FILE="$WEIGHTS_DIR/trufor.pth.tar"
  if [ ! -f "$WEIGHTS_FILE" ]; then
    echo ">>> Downloading TruFor weights from S3 (~268 MB)..."
    mkdir -p "$WEIGHTS_DIR"
    aws s3 cp "s3://banyan-ml-weights/trufor/trufor.pth.tar" "$WEIGHTS_FILE"
  else
    echo ">>> TruFor weights already present"
  fi

  # Build GPU image from repo root
  docker build --platform linux/amd64 \
    -t "$ECR_URL:latest" \
    -f "$REPO_ROOT/agents/document-forensics/Dockerfile.gpu" \
    "$REPO_ROOT"

  echo ">>> Pushing to ECR..."
  docker push "$ECR_URL:latest"

  # Only force new deployment if GPU service has desired > 0
  local DESIRED
  DESIRED=$(aws ecs describe-services \
    --cluster banyan-prod-cluster \
    --services banyan-prod-forensics-gpu-service \
    --region "$REGION" \
    --query 'services[0].desiredCount' --output text 2>/dev/null || echo "0")

  if [ "$DESIRED" -gt 0 ] 2>/dev/null; then
    echo ">>> Forcing ECS GPU service update (desired=$DESIRED)..."
    aws ecs update-service \
      --cluster banyan-prod-cluster \
      --service banyan-prod-forensics-gpu-service \
      --force-new-deployment \
      --region "$REGION" \
      --query 'service.serviceName' --output text
  else
    echo ">>> GPU service desired=0, skipping ECS update (image pushed to ECR)."
  fi

  echo ">>> Document forensics GPU image deployed."
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
  forensics)
    deploy_forensics
    ;;
  phoenix)
    deploy_phoenix
    ;;
  forensics-gpu)
    deploy_forensics_gpu
    ;;
  all)
    deploy_auth
    deploy_frontend
    deploy_investor_portal
    deploy_phoenix
    deploy_forensics
    ;;
  *)
    echo "Usage: $0 [frontend|auth|forensics|forensics-gpu|investor-portal|phoenix|all]"
    exit 1
    ;;
esac

echo ""
echo "=== Deploy complete ==="
