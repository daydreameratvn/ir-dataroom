# Agents — AI Agent Development

> This file is auto-loaded by Claude Code. It contains project conventions and the full agent building guide.

## Overview

This folder contains Papaya's AI agents. Agents handle claims processing, FWA detection, underwriting, document analysis, and other AI-powered workflows across all markets and insurance products.

Agents are built on [pi-mono](https://github.com/badlogic/pi-mono) — a TypeScript toolkit providing a unified LLM API, agent execution framework, and coding agent SDK.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Agent Framework | `@mariozechner/pi-agent-core` (agent loop, state, events) |
| LLM API | `@mariozechner/pi-ai` (20+ providers behind one interface) |
| Agent SDK | `@mariozechner/pi-coding-agent` (tools, sessions, extensions) |
| Language | TypeScript (strict mode) |
| Runtime | Node.js (deployed), Bun (local development) |
| Deployment | SST on AWS (Lambda, Step Functions, or ECS) |
| Database | PostgreSQL via Hasura GraphQL API |
| Queue/Events | AWS SQS / EventBridge |

### LLM Providers (via pi-ai)

The `@mariozechner/pi-ai` package abstracts 20+ LLM providers behind a single streaming interface. Use `getModel()` to resolve any model:

```typescript
import { getModel } from "@mariozechner/pi-ai";

const claude = getModel("amazon-bedrock", "apac.anthropic.claude-sonnet-4-20250514-v1:0");
const gemini = getModel("google", "gemini-2.5-flash");
const gpt = getModel("openai", "gpt-4.1");
```

Primary: Claude via **AWS Bedrock** (not the direct Anthropic API). This keeps all LLM traffic within our AWS account — no separate Anthropic billing, IAM-controlled access, and VPC-compatible.

### Bedrock Model IDs

Use the `amazon-bedrock` provider with cross-region inference profile IDs:

| Model | Bedrock Model ID |
|-------|-----------------|
| Claude Opus 4.6 | `apac.anthropic.claude-opus-4-20250514-v1:0` |
| Claude Sonnet 4.6 | `apac.anthropic.claude-sonnet-4-20250514-v1:0` |
| Claude Haiku 4.5 | `apac.anthropic.claude-haiku-4-5-20251001-v1:0` |

**Authentication**: Bedrock uses AWS credentials, not an API key. Set `AWS_PROFILE`, `AWS_REGION`, or standard AWS credential chain (IAM role, env vars, `~/.aws/credentials`). No `ANTHROPIC_API_KEY` needed.

## Folder Structure

```
agents/
├── CLAUDE.md
├── <agent-name>/              # Each agent is self-contained
│   ├── handler.ts             # Entry point (Lambda handler or main function)
│   ├── agent.ts               # Agent factory — system prompt, tools, loop config
│   ├── tools/                 # Tool implementations
│   │   ├── <domain>.ts        # One file per domain (claims, documents, etc.)
│   │   └── index.ts           # Barrel export
│   ├── prompts/               # System prompts and prompt templates
│   ├── types.ts               # Agent-specific types
│   └── tests/                 # Integration + unit tests
```

---

## Pi-Mono Core Concepts

### The Agent Loop

Agents run a loop: **prompt → reason → call tools → observe → repeat until done**.

```
User prompt
  → turn_start
  → LLM streams response (text + tool calls)
  → Execute tool calls sequentially
  → Feed results back to LLM
  → Next turn (loop) or finish
  → agent_end
```

The loop is managed by `@mariozechner/pi-agent-core`. You define the agent's state (system prompt, model, tools, messages) and the framework handles streaming, tool execution, context management, and event emission.

### Key Types

```typescript
// From @mariozechner/pi-ai
import type { Model, Context, Message, Tool } from "@mariozechner/pi-ai";

// From @mariozechner/pi-agent-core
import type { Agent, AgentTool, AgentEvent, AgentState } from "@mariozechner/pi-agent-core";

// From @mariozechner/pi-coding-agent (SDK)
import { createAgentSession } from "@mariozechner/pi-coding-agent";
```

### Thinking / Reasoning Levels

Control how much the LLM "thinks" before responding:

```typescript
// "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
agent.state.thinkingLevel = "medium";
```

Use `"low"` for simple tool routing, `"medium"` for standard reasoning, `"high"` for complex multi-step analysis (FWA detection, claim adjudication).

---

## Agent Creation Patterns

### Pattern 1: Minimal Agent (pi-coding-agent SDK)

The fastest way to build an agent. Uses the SDK's built-in session management:

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

export async function createMyAgent() {
  const model = getModel("amazon-bedrock", "apac.anthropic.claude-sonnet-4-20250514-v1:0");

  const { session } = await createAgentSession({
    model,
    thinkingLevel: "medium",
    tools: [myToolA, myToolB],
  });

  session.subscribe((event) => {
    if (event.type === "message_update") {
      // Handle streaming text, tool calls, etc.
    }
  });

  return session;
}
```

### Pattern 2: Full Control Agent (pi-agent-core)

When you need complete control over the agent loop, context transformation, and message handling:

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { AgentMessage, Message } from "@mariozechner/pi-agent-core";

export function createClaimsAgent(context: ClaimsContext) {
  const model = getModel("amazon-bedrock", "apac.anthropic.claude-sonnet-4-20250514-v1:0");

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(context),
      model,
      thinkingLevel: "high",
      tools: [
        fetchClaimTool,
        assessDocumentTool,
        submitDecisionTool,
      ],
      messages: [],
    },
    // Transform context before each LLM call (prune, inject, summarize)
    transformContext: (state) => {
      // Inject latest claim data, prune old messages, etc.
      return state;
    },
    // Convert agent messages to LLM-compatible format
    convertToLlm: (agentMessages: AgentMessage[]) =>
      agentMessages.filter(m => m.role !== "custom") as Message[],
  });

  agent.subscribe((event) => {
    switch (event.type) {
      case "tool_execution_start":
        console.log(`Calling tool: ${event.toolName}`);
        break;
      case "tool_execution_end":
        console.log(`Tool result: ${event.toolName}`);
        break;
      case "agent_end":
        console.log("Agent finished");
        break;
    }
  });

  return agent;
}

// Usage:
const agent = createClaimsAgent(context);
await agent.prompt("Assess this claim and determine the payout.");
await agent.waitForIdle();
```

### Pattern 3: Agent Factory (pre-fetched context + dynamic tools)

The production pattern — pre-fetch everything the agent needs, build dynamic tools, then construct:

```typescript
export async function createAssessorAgent(claimId: string) {
  // 1. Pre-fetch context
  const claim = await fetchClaim(claimId);
  const policy = await fetchPolicy(claim.policyId);
  const documents = await fetchDocuments(claimId);

  // 2. Build dynamic tools (schemas depend on fetched data)
  const assessTool = createAssessmentTool(policy.coverageTypes);
  const documentTool = createDocumentAnalysisTool(documents);

  // 3. Construct the agent
  const model = getModel("amazon-bedrock", "apac.anthropic.claude-sonnet-4-20250514-v1:0");

  const agent = new Agent({
    initialState: {
      systemPrompt: dedent`
        **Role**: You are a claims assessor for ${policy.productName}.
        **Goal**: Assess claim ${claimId} against policy terms and determine the appropriate payout.
        **Context**:
          - Policy: ${policy.productName} (${policy.id})
          - Coverage: ${policy.coverageTypes.join(", ")}
          - Claim amount: ${claim.amount} ${claim.currency}
        **Rules**:
          - Always verify document authenticity before assessment
          - Cross-reference claim amounts against policy coverage limits
          - Flag any anomalies for FWA review
          - Provide a structured decision with reasoning
      `,
      model,
      thinkingLevel: "high",
      tools: [assessTool, documentTool, fwaCheckTool, submitDecisionTool],
      messages: [],
    },
  });

  return agent;
}
```

---

## Tool Creation Patterns

Tools use [TypeBox](https://github.com/sinclairzx81/typebox) for parameter schemas (not zod — this is pi-mono's convention).

### Basic Tool (read-only)

```typescript
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const fetchClaimTool: AgentTool = {
  name: "fetch_claim",
  label: "Fetch Claim",
  description: "Retrieve claim details by ID including status, amount, and linked documents",
  parameters: Type.Object({
    claimId: Type.String({ description: "The claim ID to fetch" }),
  }),
  async execute(_toolCallId, params) {
    const response = await fetch(`${HASURA_ENDPOINT}/v1/graphql`, {
      method: "POST",
      headers: { "x-hasura-admin-secret": HASURA_SECRET, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query GetClaim($id: uuid!) { claims_by_pk(id: $id) { id status amount currency documents { id url type } } }`,
        variables: { id: params.claimId },
      }),
    });
    const { data } = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data.claims_by_pk) }],
      details: { claimId: params.claimId },
    };
  },
};
```

### Tool with Streaming Progress

```typescript
export const analyzeDocumentTool: AgentTool = {
  name: "analyze_document",
  label: "Analyze Document",
  description: "Analyze a document image for authenticity and extract key fields",
  parameters: Type.Object({
    documentUrl: Type.String({ description: "URL of the document to analyze" }),
    documentType: Type.String({ description: "Type: medical_report, receipt, id_card, etc." }),
  }),
  async execute(_toolCallId, params, signal, onUpdate) {
    // Stream progress to the UI
    onUpdate?.({ content: [{ type: "text", text: "Downloading document..." }], details: {} });

    const doc = await downloadDocument(params.documentUrl);

    onUpdate?.({ content: [{ type: "text", text: "Running analysis..." }], details: {} });

    const analysis = await runDocumentAnalysis(doc, params.documentType);

    return {
      content: [{ type: "text", text: JSON.stringify(analysis) }],
      details: { documentType: params.documentType, fieldsExtracted: analysis.fields.length },
    };
  },
};
```

### Tool Factory (dynamic schema from runtime data)

When the tool's schema depends on fetched data (policy types, enum values, etc.):

```typescript
export function createAssessmentTool(coverageTypes: string[]): AgentTool {
  return {
    name: "submit_assessment",
    label: "Submit Assessment",
    description: `Submit a claim assessment. Available coverage types: ${coverageTypes.join(", ")}`,
    parameters: Type.Object({
      decision: Type.Union([Type.Literal("approve"), Type.Literal("deny"), Type.Literal("escalate")]),
      coverageType: Type.Union(coverageTypes.map(t => Type.Literal(t))),
      amount: Type.Number({ description: "Approved payout amount" }),
      reasoning: Type.String({ description: "Detailed reasoning for the decision" }),
    }),
    async execute(_toolCallId, params) {
      const result = await submitAssessment(params);
      return {
        content: [{ type: "text", text: `Assessment submitted: ${params.decision}` }],
        details: params,
      };
    },
  };
}
```

### Tool with Cancellation Support

```typescript
export const longRunningTool: AgentTool = {
  name: "deep_analysis",
  label: "Deep Analysis",
  description: "Run deep FWA analysis across historical claims",
  parameters: Type.Object({
    claimId: Type.String({ description: "Claim to analyze" }),
  }),
  async execute(_toolCallId, params, signal) {
    // Check abort signal periodically
    const results = [];
    for (const batch of historicalBatches) {
      if (signal?.aborted) break;
      results.push(await analyzeBatch(batch, params.claimId));
    }
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
      details: { batchesProcessed: results.length },
    };
  },
};
```

### Tool Design Rules

- **Always describe every parameter** — the LLM reads descriptions to decide what to fill
- **Return structured data** — let the LLM interpret and present results, don't format strings
- **Use `label`** — shown in UI while the tool is executing
- **One file per domain** — group related tools (all claim tools in `claims.ts`, document tools in `documents.ts`)
- **Idempotent** — agents may retry on failure; tools must handle duplicate calls safely

---

## Agent-to-Agent Calling

Wrap one agent as a tool for another:

```typescript
export const fwaSubAgentTool: AgentTool = {
  name: "run_fwa_check",
  label: "FWA Check",
  description: "Run the FWA detection agent on this claim to check for fraud indicators",
  parameters: Type.Object({
    claimId: Type.String({ description: "Claim ID to check" }),
  }),
  async execute(_toolCallId, params) {
    // Lazy import to avoid circular dependencies
    const { createFWAAgent } = await import("../fwa-detection/agent");
    const agent = createFWAAgent(params.claimId);

    await agent.prompt(`Analyze claim ${params.claimId} for fraud indicators.`);
    await agent.waitForIdle();

    // Extract the final text response
    const lastMessage = agent.state.messages.at(-1);
    const text = lastMessage?.role === "assistant"
      ? lastMessage.content.filter(c => c.type === "text").map(c => c.text).join("")
      : "No result";

    return {
      content: [{ type: "text", text }],
      details: { claimId: params.claimId },
    };
  },
};
```

**Rule**: Use lazy `import()` to avoid circular dependencies between agent folders.

---

## System Prompt Best Practices

Structure prompts with bold headers. Use `dedent` for clean formatting:

```typescript
import dedent from "dedent";

const systemPrompt = dedent`
  **Role**: You are a claims assessor specializing in health insurance.

  **Goal**: Assess the submitted claim against the policy terms and render a decision.

  **Rules**:
  - Verify all documents are authentic before assessment
  - Cross-reference claim amounts against coverage limits
  - Flag anomalies for FWA review — do NOT approve suspicious claims
  - Always provide structured reasoning with your decision

  **Steps**:
  1. Call \`fetch_claim\` to get claim details
  2. Call \`analyze_document\` for each attached document
  3. Call \`run_fwa_check\` if any anomaly detected
  4. Call \`submit_assessment\` with your final decision

  **Output**: Always end with a structured summary including:
  - Decision (approve/deny/escalate)
  - Approved amount (if applicable)
  - Key findings from document analysis
  - FWA risk score (if checked)
`;
```

### Prompt Rules

- Use `dedent` — no leading whitespace pollution
- Structure: **Role** → **Goal** → **Rules** → **Steps** → **Output**
- Be explicit about tool call order when it matters
- Specify language requirements when applicable
- Include examples for complex logic (multi-claim grouping, financial calculations)
- When agent must stop and wait for user: "STOP and wait for user response. Do NOT call any other tools."

---

## Event Handling

Subscribe to agent events for logging, metrics, and UI updates:

```typescript
agent.subscribe((event) => {
  switch (event.type) {
    case "agent_start":
      logger.info("Agent started");
      break;
    case "turn_start":
      logger.info(`Turn ${event.turnNumber} started`);
      break;
    case "message_update":
      if (event.assistantMessageEvent?.type === "text_delta") {
        // Stream text to UI
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;
    case "tool_execution_start":
      logger.info(`Calling tool: ${event.toolName}`, event.args);
      break;
    case "tool_execution_end":
      logger.info(`Tool result: ${event.toolName}`, event.result);
      break;
    case "agent_end":
      logger.info("Agent finished", { messages: event.newMessages.length });
      break;
  }
});
```

**Event flow:**
```
agent_start → turn_start → message_start (user) → message_end (user)
  → message_start (assistant, streaming) → message_update* → message_end (assistant)
  → tool_execution_start → tool_execution_update* → tool_execution_end
  → message_start (tool result) → message_end (tool result)
  → turn_end → turn_start (next turn) → ... → turn_end → agent_end
```

---

## Extensions

Pi-mono's extension system lets you add custom tools, commands, event handlers, and shortcuts. Extensions are TypeScript modules in `.pi/extensions/` or `~/.pi/agent/extensions/`.

```typescript
import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Register a custom tool
  pi.registerTool({
    name: "papaya_query",
    label: "Papaya Query",
    description: "Query Papaya's Hasura GraphQL API",
    parameters: Type.Object({
      query: Type.String({ description: "GraphQL query string" }),
      variables: Type.Optional(Type.String({ description: "JSON-encoded variables" })),
    }),
    async execute(_toolCallId, params) {
      const response = await fetch(HASURA_ENDPOINT, {
        method: "POST",
        headers: { "x-hasura-admin-secret": HASURA_SECRET, "Content-Type": "application/json" },
        body: JSON.stringify({ query: params.query, variables: JSON.parse(params.variables || "{}") }),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }], details: {} };
    },
  });

  // Gate dangerous operations
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.args.command.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Danger", "Allow destructive command?");
      return { block: !ok, reason: "User denied destructive command" };
    }
  });
}
```

---

## Error Handling

- **Max iteration limit** — always set a cap to prevent infinite loops
- **Retry with backoff** — failed tool calls retry up to 3 times with exponential backoff
- **Structured errors** — if the agent cannot complete, return a structured error with context, not a crash
- **Auto-fallback** — if the agentic path fails, fall back to previous non-agentic logic where available
- **Audit trail** — log every tool call, reasoning step, and decision point

---

## Testing

- Every agent needs integration tests with mocked LLM responses
- Tool functions are unit tested independently
- Use deterministic test cases with known-good inputs and expected outputs
- Test the fallback path (agent failure → graceful degradation)
- Use Vitest: `npx vitest run tests/`

---

## Deployment

- Agents are deployed via SST — each agent maps to an SST construct
- Environment variables for LLM API keys, Hasura endpoint, and feature flags are managed in SST config
- Agents follow the backward compatibility rules from root `CLAUDE.md` — new agent versions run alongside old ones during rollout

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Bedrock access (Claude LLM) |
| `AWS_REGION` | Bedrock region (default: `ap-southeast-1`) |
| `HASURA_GRAPHQL_ENDPOINT` | Hasura DDN Cloud API URL |
| `HASURA_ADMIN_TOKEN` | Pre-signed JWT for DDN Cloud auth (Bearer token) |
| `HASURA_ADMIN_SECRET` | **Deprecated** — legacy self-hosted auth, falls back if `HASURA_ADMIN_TOKEN` is not set |
| Additional provider keys | Fallback LLM providers as needed |

**Note**: Do NOT use `ANTHROPIC_API_KEY`. All Claude access goes through Bedrock.

**Hasura auth migration**: DDN Cloud uses Bearer JWT authentication instead of `x-hasura-admin-secret`. Set `HASURA_ADMIN_TOKEN` (the pre-signed JWT from SSM `/banyan/hasura/admin-token`) and update `HASURA_GRAPHQL_ENDPOINT` to the DDN Cloud URL. The client auto-detects which auth method to use.

---

## Checklist for New Agent

1. **Folder**: Create `agents/<name>/`
2. **Tools** (`tools/<domain>.ts`)
   - [ ] Define tools with TypeBox schemas — every param has a `description`
   - [ ] Use `label` for UI display during execution
   - [ ] Return structured data in `content` and `details`
   - [ ] Make all tools idempotent
3. **Agent** (`agent.ts`)
   - [ ] Async factory function: `createXAgent(params)`
   - [ ] Pre-fetch context in factory (policies, documents, enums)
   - [ ] Structured system prompt with `dedent` (Role, Goal, Rules, Steps, Output)
   - [ ] Set thinking level appropriate to complexity
   - [ ] Subscribe to events for logging and audit trail
4. **Handler** (`handler.ts`)
   - [ ] Wire agent to Lambda/Step Functions/ECS entry point
   - [ ] Parse and validate input
   - [ ] Handle errors with structured responses
   - [ ] Log completion metrics
5. **Tests** (`tests/`)
   - [ ] Integration test with mocked LLM responses
   - [ ] Unit tests for each tool
   - [ ] Test error/fallback paths
6. **Config**
   - [ ] Add SST construct for deployment
   - [ ] Configure environment variables
   - [ ] Set up monitoring/alerting

---

## Work Scope

When working in this folder, only reference:
- Files within `agents/`
- Root `tsconfig.json` and `package.json`
- `packages/` for shared utilities

Do not read or modify files in `platform/`, `mobile/`, `sdks/`, `hasura/`, or `rootstock/`.
