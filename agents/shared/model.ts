import { getModel } from "@mariozechner/pi-ai";

// Bedrock models — use GLOBAL cross-region inference profile IDs.
// APAC profiles don't include Claude 4.6/Opus; global profiles route
// to the nearest available region from any AWS_REGION endpoint.

export const bedrockOpus = getModel(
  "amazon-bedrock",
  "global.anthropic.claude-opus-4-6-v1",
);

export const bedrockSonnet = getModel(
  "amazon-bedrock",
  "global.anthropic.claude-sonnet-4-6",
);

export const bedrockHaiku = getModel(
  "amazon-bedrock",
  "global.anthropic.claude-haiku-4-5-20251001-v1:0",
);

// Google models — requires GEMINI_API_KEY env var (from SSM /banyan/forensics/gemini-api-key)
export const geminiFlash = getModel(
  "google",
  "gemini-3-flash-preview",
);
