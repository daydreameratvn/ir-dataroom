import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { vertex } from "@ai-sdk/google-vertex";
import { generateText } from "ai";

/**
 * Google Search tool that uses Vertex AI's enterprise web search grounding.
 * Searches the web for given keywords and returns aggregated results.
 */
export const googleSearchTool: AgentTool = {
  name: "googleSearch",
  label: "Google Search",
  description: "Search the web for the given keywords",
  parameters: Type.Object({
    keywords: Type.Array(Type.String(), { description: "The keywords to search for" }),
  }),
  execute: async (toolCallId, { keywords }) => {
    const results = await Promise.all(
      keywords.map(async (keyword: string) => {
        const result = await generateText({
          model: vertex("gemini-2.5-flash"),
          tools: { googleSearch: vertex.tools.enterpriseWebSearch({}) },
          messages: [{ content: keyword, role: "user" }],
        });
        return { keyword, result: result.text };
      }),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
      details: { keywords },
    };
  },
};
