import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { streamFatimaResponse, type ChatMessage } from "../services/fatima.ts";

const fatima = new Hono();

// POST /auth/fatima/chat — stream AI response via SSE
fatima.post("/fatima/chat", async (c) => {
  const body = await c.req.json<{ messages: ChatMessage[]; language?: string }>();

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "messages array is required" }, 400);
  }

  // Validate message format
  for (const msg of body.messages) {
    if (!msg.role || !msg.content) {
      return c.json({ error: "Each message must have role and content" }, 400);
    }
    if (msg.role !== "user" && msg.role !== "assistant") {
      return c.json({ error: "role must be 'user' or 'assistant'" }, 400);
    }
  }

  return streamSSE(c, async (stream) => {
    const abortController = new AbortController();

    // Abort streaming if client disconnects
    c.req.raw.signal.addEventListener("abort", () => {
      abortController.abort();
    });

    try {
      for await (const chunk of streamFatimaResponse(
        body.messages,
        abortController.signal,
        body.language
      )) {
        await stream.writeSSE({
          data: JSON.stringify({ type: "delta", text: chunk }),
        });
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: "done" }),
      });
    } catch (err) {
      if (abortController.signal.aborted) return;

      console.error("[Fatima] Stream error:", (err as Error).message);
      await stream.writeSSE({
        data: JSON.stringify({
          type: "error",
          message: "Something went wrong. Please try again.",
        }),
      });
    }
  });
});

export default fatima;
