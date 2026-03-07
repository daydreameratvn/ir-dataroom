---
name: agents-dev
description: |
  Pi-mono agent and tool creation patterns, system prompts, events, and extensions.
  Use when: creating new agents, writing agent tools, building system prompts,
  handling agent events, or working with pi-agent-core / pi-ai / pi-coding-agent.
  Triggers on: files in agents/, imports from @mariozechner/pi-*, AgentTool,
  Agent class, createAgentSession, TypeBox schemas, or agent-related development.
---

# Agent Development Patterns

## Agent Creation Patterns

### Pattern 1: Minimal Agent (pi-coding-agent SDK)

The fastest way to build an agent. Uses the SDK's built-in session management:

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

export async function createMyAgent() {
  const model = getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-6");

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
  const model = getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-6");

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
  const model = getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-6");

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
