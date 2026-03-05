/**
 * Test which Bedrock models are accessible in this account.
 */
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const models = [
  ["us.anthropic.claude-opus-4-6-v1", "Opus 4.6 US", "us-east-1"],
  ["us.anthropic.claude-sonnet-4-6", "Sonnet 4.6 US", "us-east-1"],
  ["us.anthropic.claude-haiku-4-5-20251001-v1:0", "Haiku 4.5 US", "us-east-1"],
] as const;

for (const [id, label, region] of models) {
  process.env.AWS_REGION = region;
  const m = getModel("amazon-bedrock", id);
  if (!m) {
    console.log(`${label}: NOT IN REGISTRY`);
    continue;
  }
  try {
    const stream = streamSimple(m, {
      systemPrompt: "Reply with only the word 'yes'.",
      messages: [{ role: "user", content: "test", timestamp: Date.now() }],
      tools: [],
    }, { reasoning: undefined });
    let text = "";
    let error = "";
    for await (const e of stream) {
      if (e.type === "text_delta") text += e.delta;
      if (e.type === "error") error = (e as any).error?.errorMessage || "unknown";
      if (e.type === "done") break;
    }
    console.log(`${label} (${region}): ${error ? "ERROR: " + error : "OK: " + text.trim()}`);
  } catch (err) {
    console.log(`${label}: EXCEPTION: ${err instanceof Error ? err.message : err}`);
  }
}
