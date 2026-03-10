import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";

const region = process.env.AWS_REGION || "ap-southeast-1";
const client = new BedrockRuntimeClient({ region });

// Claude Haiku 4.5 via global cross-region inference — fast and affordable
const MODEL_ID =
  process.env.IR_CHAT_MODEL_ID ||
  "global.anthropic.claude-haiku-4-5-20251001-v1:0";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface IRChatContext {
  roundName: string;
  roundStatus: string;
  targetRaise: number | null;
  currency: string | null;
  investorName: string;
  investorFirm: string | null;
  knowledgeBase: Array<{ name: string; content: string }>;
}

function buildSystemPrompt(ctx: IRChatContext): string {
  const docs =
    ctx.knowledgeBase.length > 0
      ? ctx.knowledgeBase
          .map((doc) => `### ${doc.name}\n${doc.content}`)
          .join("\n\n")
      : "_No documents have been uploaded yet._";

  return `You are Papaya's Investor Relations AI Assistant. You help existing investors understand the company's financials, performance, and strategy.

## Rules
- ONLY answer based on the documents provided below in the Knowledge Base section.
- If information is not in the documents, clearly say "I don't have that information in the current investor materials" — never fabricate data.
- Cite sources: append [Source: {document name}] after factual claims.
- When calculating financial ratios, show the formula using KaTeX math notation (e.g., $P/E = \\frac{Price}{EPS}$) and include the source numbers.
- When asked for a chart or visualization, output a fenced code block with language "chart" containing a JSON object with this exact schema:
  {"type": "bar"|"line"|"area"|"pie", "title": "...", "data": [...], "xKey": "...", "series": [{"dataKey": "...", "name": "...", "color": "..."}]}
  The data array should contain objects with string/number values. Use descriptive series names.
- Be concise, professional, and investor-appropriate in tone.
- Do not disclose information about other investors or internal operations.
- Format responses with markdown: use headers, bold, tables, and bullet points for clarity.

## Investor Context
- Name: ${ctx.investorName}${ctx.investorFirm ? ` (${ctx.investorFirm})` : ""}
- Round: ${ctx.roundName} (${ctx.roundStatus})${ctx.targetRaise != null && ctx.currency ? `\n- Target Raise: ${ctx.currency} ${ctx.targetRaise.toLocaleString()}` : ""}

## Knowledge Base Documents
${docs}`;
}

/**
 * Stream an investor chat response via Bedrock ConverseStream.
 * Yields text chunks as they arrive.
 */
export async function* streamInvestorChatResponse(
  messages: ChatMessage[],
  context: IRChatContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const bedrockMessages: Message[] = messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));

  const systemPrompt = buildSystemPrompt(context);

  const command = new ConverseStreamCommand({
    modelId: MODEL_ID,
    system: [{ text: systemPrompt }],
    messages: bedrockMessages,
    inferenceConfig: {
      maxTokens: 4096,
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
