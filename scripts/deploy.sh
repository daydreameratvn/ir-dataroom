#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# Banyan Deploy Script
#
# Deploys the frontend (S3 + CloudFront) and auth service (ECR + ECS).
# Usage: AWS_PROFILE=banyan bash scripts/deploy.sh [frontend|auth|all]
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

# ----- Helper: get Pulumi stack output -----
get_output() {
  local key="$1"
  cd "$REPO_ROOT/rootstock"
  export PULUMI_CONFIG_PASSPHRASE=$(aws ssm get-parameter \
    --name /banyan/pulumi/config-passphrase \
    --with-decryption --region "$REGION" \
    --query Parameter.Value --output text)
  pulumi stack output "$key" 2>/dev/null
}

# =============================================================
# Deploy Auth Service
# =============================================================
deploy_auth() {
  echo ">>> Building auth Docker image..."
  local ECR_URL
  ECR_URL=$(get_output AuthEcrRepoUrl)
  echo "ECR: $ECR_URL"

  # Login to ECR
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

  # Build from repo root (Dockerfile references auth/ and platform/)
  docker build -t "$ECR_URL:latest" -f "$REPO_ROOT/auth/Dockerfile" "$REPO_ROOT"

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

  local BUCKET
  BUCKET=$(get_output FrontendBucketName)
  local CF_ID
  CF_ID=$(get_output CloudFrontDistributionId)

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

  local CF_DOMAIN
  CF_DOMAIN=$(get_output CloudFrontDomainName)
  echo ">>> Frontend deployed at https://$CF_DOMAIN"
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
  all)
    deploy_auth
    deploy_frontend
    ;;
  *)
    echo "Usage: $0 [frontend|auth|all]"
    exit 1
    ;;
esac

echo ""
echo "=== Deploy complete ==="
