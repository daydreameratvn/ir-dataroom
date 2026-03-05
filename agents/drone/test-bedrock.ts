/**
 * Quick diagnostic: Test Bedrock connectivity via pi-ai.
 * Verifies AWS credentials + model resolution + actual API call.
 *
 * Usage:
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 bun run agents/drone/test-bedrock.ts
 */
import { getModel, streamSimple } from "@mariozechner/pi-ai";

// 1. Test model resolution — use global inference profile IDs (same as model.ts)
console.log("[Diag] Testing model resolution...");
const opus = getModel("amazon-bedrock", "global.anthropic.claude-opus-4-6-v1");
const sonnet = getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-6");
const haiku = getModel("amazon-bedrock", "global.anthropic.claude-haiku-4-5-20251001-v1:0");

console.log(`  Opus:   ${opus ? `${opus.id} (api=${opus.api}, provider=${opus.provider})` : "NOT FOUND"}`);
console.log(`  Sonnet: ${sonnet ? `${sonnet.id} (api=${sonnet.api}, provider=${sonnet.provider})` : "NOT FOUND"}`);
console.log(`  Haiku:  ${haiku ? `${haiku.id} (api=${haiku.api}, provider=${haiku.provider})` : "NOT FOUND"}`);

if (!opus && !sonnet && !haiku) {
  console.error("[Diag] No models found. Listing available Bedrock models:");
  const { getModels } = await import("@mariozechner/pi-ai");
  const models = getModels("amazon-bedrock");
  for (const m of models.slice(0, 20)) {
    console.log(`  - ${m.id} (api=${m.api})`);
  }
  process.exit(1);
}

// 2. Test actual Bedrock API call with Haiku (cheapest)
const testModel = haiku || sonnet || opus;
console.log(`\n[Diag] Testing Bedrock API call with ${testModel!.id}...`);
console.log(`  AWS_PROFILE=${process.env.AWS_PROFILE}`);
console.log(`  AWS_REGION=${process.env.AWS_REGION}`);

const start = Date.now();
try {
  const stream = streamSimple(testModel!, {
    systemPrompt: "You are a helpful assistant. Reply in one short sentence.",
    messages: [
      { role: "user", content: "Say hello.", timestamp: Date.now() },
    ],
    tools: [],
  }, {
    reasoning: undefined,
  });

  let fullText = "";
  let gotStart = false;
  let gotDone = false;
  let errorMsg = "";

  for await (const event of stream) {
    switch (event.type) {
      case "start":
        gotStart = true;
        console.log(`  [stream] start`);
        break;
      case "text_delta":
        fullText += event.delta;
        break;
      case "done":
        gotDone = true;
        console.log(`  [stream] done (stopReason=${event.reason})`);
        if (event.message) {
          console.log(`  [stream] usage: input=${event.message.usage.input}, output=${event.message.usage.output}`);
        }
        break;
      case "error":
        errorMsg = event.error?.errorMessage || "Unknown stream error";
        console.error(`  [stream] ERROR: ${errorMsg}`);
        break;
    }
  }

  const elapsed = Date.now() - start;
  console.log(`\n[Diag] Bedrock call completed in ${elapsed}ms`);
  console.log(`  Got start: ${gotStart}`);
  console.log(`  Got done: ${gotDone}`);
  console.log(`  Response text: "${fullText}"`);
  if (errorMsg) {
    console.error(`  Error: ${errorMsg}`);
  }

  if (gotDone && fullText.length > 0) {
    console.log("\n[Diag] SUCCESS - Bedrock connectivity is working!");
  } else if (errorMsg) {
    console.error("\n[Diag] FAILED - Bedrock returned an error.");
  } else {
    console.warn("\n[Diag] UNKNOWN - Stream completed but no text received.");
  }
} catch (error) {
  const elapsed = Date.now() - start;
  console.error(`\n[Diag] EXCEPTION after ${elapsed}ms:`, error);
}
