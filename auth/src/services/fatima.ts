import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { readFileSync } from "fs";
import { resolve } from "path";

const region = process.env.AWS_REGION || "ap-southeast-1";
const client = new BedrockRuntimeClient({ region });

// Claude Haiku 4.5 via global cross-region inference — fast and affordable for chat
const MODEL_ID =
  process.env.FATIMA_MODEL_ID ||
  "global.anthropic.claude-haiku-4-5-20251001-v1:0";

let cachedSystemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;

  // Load the Oasis guide as knowledge base
  const guidePath =
    process.env.OASIS_GUIDE_PATH ||
    resolve(import.meta.dir, "../../../platform/docs/oasis-guide.md");

  let guide = "";
  try {
    guide = readFileSync(guidePath, "utf-8");
  } catch {
    console.warn(
      `[Fatima] Could not load Oasis guide from ${guidePath}, using minimal prompt`
    );
  }

  cachedSystemPrompt = guide || getFallbackPrompt();
  return cachedSystemPrompt;
}

function getFallbackPrompt(): string {
  return `You are Fatima, the wise woman of the desert — like the character from Paulo Coelho's The Alchemist. You guide users through the Oasis insurance operations platform with calm confidence and deep knowledge. You can help with claims, policies, underwriting, fraud detection, reporting, and provider management.`;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  vi: "Vietnamese (Tiếng Việt)",
  th: "Thai (ภาษาไทย)",
  zh: "Chinese (中文)",
};

/**
 * Stream a Fatima response via Bedrock ConverseStream.
 * Yields text chunks as they arrive.
 */
export async function* streamFatimaResponse(
  messages: ChatMessage[],
  signal?: AbortSignal,
  language?: string
): AsyncGenerator<string> {
  const bedrockMessages: Message[] = messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));

  // Build system prompt with language instruction
  let systemPrompt = getSystemPrompt();
  if (language && language !== "en") {
    const langName = LANGUAGE_NAMES[language] || language;
    systemPrompt += `\n\nIMPORTANT: The user's interface language is ${langName}. You MUST respond in ${langName}. Always use ${langName} for your responses, regardless of the language of the user's message.`;
  }

  const command = new ConverseStreamCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: bedrockMessages,
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.3,
    },
  });

  const response = await client.send(command, {
    abortSignal: signal,
  });

  if (!response.stream) {
    throw new Error("No stream in Bedrock response");
  }

  for await (const event of response.stream) {
    if (signal?.aborted) break;

    if (event.contentBlockDelta?.delta?.text) {
      yield event.contentBlockDelta.delta.text;
    }
  }
}
