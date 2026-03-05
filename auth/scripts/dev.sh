#!/bin/bash
# Start the auth server in local dev mode.
# All auth routes use DDN GraphQL — no direct DB connection needed.
# JWT signing uses the same key as DDN Cloud for token verification.

set -euo pipefail

export AWS_PROFILE=banyan

export HASURA_ADMIN_TOKEN=$(aws ssm get-parameter \
  --name /banyan/hasura/admin-token \
  --with-decryption --query Parameter.Value --output text)

export JWT_SECRET_KEY=$(aws ssm get-parameter \
  --name /banyan/hasura/jwt-secret-key \
  --with-decryption --query Parameter.Value --output text)

# Export AWS credentials as env vars for SDK calls (SES, SNS, Bedrock, S3)
eval $(aws configure export-credentials --profile banyan --format env)

# Force HTTP/1.1 for Bedrock — Bun's HTTP/2 implementation causes
# "http2 request did not get a response" errors with the AWS SDK's
# NodeHttp2Handler on streaming ConverseStream calls.
export AWS_BEDROCK_FORCE_HTTP1=1

# Ensure S3 bucket for portal document uploads exists (idempotent)
aws s3 mb s3://banyan-portal-documents --region ap-southeast-1 2>/dev/null || true

cd "$(dirname "$0")/.." && exec bun run --hot src/index.ts
