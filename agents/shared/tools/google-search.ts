import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { GoogleGenAI } from "@google/genai";

/**
 * Google Search tool that uses Gemini's built-in google_search grounding.
 * All keywords are searched in a SINGLE batch call (not one agent per keyword).
 */
export const googleSearchTool: AgentTool = {
  name: "googleSearch",
  label: "Google Search",
  description: "Search the web for the given keywords. All keywords are searched in a SINGLE batch call.",
  parameters: Type.Object({
    keywords: Type.Array(Type.String(), { description: "The keywords to search for" }),
  }),
  execute: async (toolCallId, { keywords }) => {
    const searchStart = Date.now();
    console.log(`[googleSearch] searching ${keywords.length} keywords in single call...`);

    try {
      const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const result = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Search for the following and return results for each:\n${keywords.map((k, i) => `${i + 1}. ${k}`).join("\n")}`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = result.text ?? "";
      console.log(`[googleSearch] done in ${Date.now() - searchStart}ms for ${keywords.length} keywords`);
      return {
        content: [{ type: "text", text }],
        details: { keywords },
      };
    } catch (error) {
      console.error(`[googleSearch] error after ${Date.now() - searchStart}ms:`, error instanceof Error ? error.message : String(error));
      return {
        content: [{ type: "text", text: `Search failed: ${error instanceof Error ? error.message : String(error)}` }],
        details: { keywords },
      };
    }
  },
};
