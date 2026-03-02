#!/usr/bin/env bash
# Wrapper to launch Figma MCP server with API key from SSM
set -euo pipefail

FIGMA_API_KEY=$(AWS_PROFILE=banyan aws ssm get-parameter \
  --name "/banyan/figma/api-key" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text \
  --region ap-southeast-1)

export FIGMA_API_KEY
exec npx -y figma-developer-mcp --stdio
