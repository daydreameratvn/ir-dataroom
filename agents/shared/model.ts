import { getModel } from "@mariozechner/pi-ai";

// Bedrock models — use US cross-region inference profile IDs.
// APAC profiles don't include Claude 4.x models in pi-ai's registry,
// and GLOBAL profiles need separate use-case form approval.
// US profiles work and are registered in pi-ai.

export const bedrockOpus = getModel(
  "amazon-bedrock",
  "us.anthropic.claude-opus-4-6-v1",
);

export const bedrockSonnet = getModel(
  "amazon-bedrock",
  "us.anthropic.claude-sonnet-4-6",
);

export const bedrockHaiku = getModel(
  "amazon-bedrock",
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
);
