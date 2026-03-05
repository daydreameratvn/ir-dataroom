/**
 * Debug: Create a drone agent for one claim and check all state after prompt().
 */
import { bedrockOpus } from "../shared/model.ts";
import { createDroneAgent } from "./agent.ts";

console.log(`[Debug] Model: ${bedrockOpus ? `${bedrockOpus.id} (api=${bedrockOpus.api})` : "NOT FOUND"}`);

const claimCode = "RE-26-295041";
console.log(`[Debug] Creating agent for ${claimCode}...`);

const agent = await createDroneAgent(claimCode, { skipCompliance: true });

console.log(`[Debug] Agent created. Model in state: ${agent.state.model?.id ?? "NONE"}`);
console.log(`[Debug] Tools: ${agent.state.tools.map(t => t.name).join(", ")}`);
console.log(`[Debug] System prompt length: ${agent.state.systemPrompt.length} chars`);

// Subscribe to ALL events for debugging
agent.subscribe((e) => {
  switch (e.type) {
    case "agent_start":
      console.log("[Debug] EVENT: agent_start");
      break;
    case "turn_start":
      console.log("[Debug] EVENT: turn_start");
      break;
    case "turn_end":
      console.log(`[Debug] EVENT: turn_end (errorMessage=${(e as any).message?.errorMessage ?? "none"})`);
      break;
    case "message_start":
      console.log(`[Debug] EVENT: message_start (role=${(e as any).message?.role})`);
      break;
    case "message_update":
      // too noisy, skip
      break;
    case "message_end":
      const msg = (e as any).message;
      console.log(`[Debug] EVENT: message_end (role=${msg?.role}, stopReason=${msg?.stopReason}, error=${msg?.errorMessage ?? "none"})`);
      if (msg?.content) {
        for (const c of msg.content) {
          if (c.type === "text") console.log(`  text: "${c.text.slice(0, 200)}..."`);
          if (c.type === "toolCall") console.log(`  toolCall: ${c.name}(${JSON.stringify(c.arguments).slice(0, 100)})`);
          if (c.type === "thinking") console.log(`  thinking: "${c.thinking.slice(0, 200)}..."`);
        }
      }
      break;
    case "tool_execution_start":
      console.log(`[Debug] EVENT: tool_start: ${(e as any).toolName}`);
      break;
    case "tool_execution_end":
      console.log(`[Debug] EVENT: tool_end: ${(e as any).toolName} (error=${(e as any).isError})`);
      break;
    case "agent_end":
      console.log("[Debug] EVENT: agent_end");
      break;
    default:
      console.log(`[Debug] EVENT: ${e.type}`);
  }
});

console.log(`\n[Debug] Running agent.prompt("${claimCode}")...`);
const start = Date.now();
await agent.prompt(claimCode);
const elapsed = Date.now() - start;

console.log(`\n[Debug] Prompt completed in ${elapsed}ms`);
console.log(`[Debug] Agent error: ${agent.state.error ?? "none"}`);
console.log(`[Debug] Messages count: ${agent.state.messages.length}`);

// Dump last message
const lastMsg = agent.state.messages[agent.state.messages.length - 1];
if (lastMsg) {
  console.log(`[Debug] Last message role: ${lastMsg.role}`);
  console.log(`[Debug] Last message stopReason: ${(lastMsg as any).stopReason}`);
  console.log(`[Debug] Last message errorMessage: ${(lastMsg as any).errorMessage ?? "none"}`);
  if (Array.isArray((lastMsg as any).content)) {
    for (const c of (lastMsg as any).content) {
      if (c.type === "text") console.log(`[Debug] Last message text: "${c.text.slice(0, 500)}"`);
    }
  }
}
