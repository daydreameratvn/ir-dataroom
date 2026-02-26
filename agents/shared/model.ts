import { getModel } from "@mariozechner/pi-ai";

// Cross-region inference: call from home region (ap-southeast-1 via AWS_REGION env)
// with the APAC inference profile ID — Bedrock routes to the right region automatically.

export const bedrockOpus = getModel(
  "amazon-bedrock",
  "apac.anthropic.claude-opus-4-20250514-v1:0",
);

export const bedrockSonnet = getModel(
  "amazon-bedrock",
  "apac.anthropic.claude-sonnet-4-20250514-v1:0",
);

export const bedrockHaiku = getModel(
  "amazon-bedrock",
  "apac.anthropic.claude-haiku-4-5-20251001-v1:0",
);
