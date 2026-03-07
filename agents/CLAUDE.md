# Agents — AI Agent Development

> This file is auto-loaded by Claude Code. For detailed agent/tool creation patterns, the `agents-dev` skill is auto-loaded when working in this directory. For scaffolding a new agent, use the `new-agent` skill.

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

const claude = getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-6");
const gemini = getModel("google", "gemini-2.5-flash");
const gpt = getModel("openai", "gpt-4.1");
```

Primary: Claude via **AWS Bedrock** (not the direct Anthropic API). This keeps all LLM traffic within our AWS account — no separate Anthropic billing, IAM-controlled access, and VPC-compatible.

### Bedrock Model IDs

Use the `amazon-bedrock` provider with cross-region inference profile IDs:

| Model | Bedrock Model ID |
|-------|-----------------|
| Claude Opus 4.6 | `global.anthropic.claude-opus-4-6-v1` |
| Claude Sonnet 4.6 | `global.anthropic.claude-sonnet-4-6` |
| Claude Haiku 4.5 | `global.anthropic.claude-haiku-4-5-20251001-v1:0` |

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

## Error Handling

- **Max iteration limit** — always set a cap to prevent infinite loops
- **Retry with backoff** — failed tool calls retry up to 3 times with exponential backoff
- **Structured errors** — if the agent cannot complete, return a structured error with context, not a crash
- **Auto-fallback** — if the agentic path fails, fall back to previous non-agentic logic where available
- **Audit trail** — log every tool call, reasoning step, and decision point

---

## Testing

Follow the red/green TDD protocol (`tdd` skill). Agent-specific conventions:

### Mock Strategy

- **Mock at module boundaries** — `vi.mock("@mariozechner/pi-agent-core")`, not individual functions
- **Mock classes as classes** — use `class MockAgent {}`, not `vi.fn().mockImplementation(() => ({}))`
- **Mock LLM calls — never call real models** in tests
- **Keep mocks minimal** — only mock what the test needs, let everything else be real

### What to Test

| Component | Test | Mock |
|-----------|------|------|
| Pure functions (math, parsing, extraction) | Unit test with known inputs/outputs | Nothing |
| Tool factories (`createXDefinition`) | Verify returned structure, embedded config | External tool imports |
| Agent runner (`runSubAgent`) | Success, error, timeout, event streaming | `Agent` class, model |
| Tool `execute` functions | Input → output with mocked dependencies | GraphQL client, HTTP, LLM |
| System prompt builders | Contains required sections, dynamic values | Nothing |
| Rules/config exports | Structure, required fields present | Nothing |

### Running Tests

```bash
# Run all agent tests
cd agents && bunx vitest run

# Run specific test file
cd agents && bunx vitest run subagents/runner.test.ts

# Watch mode during development
cd agents && bunx vitest watch
```

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

## Work Scope

When working in this folder, only reference:
- Files within `agents/`
- Root `tsconfig.json` and `package.json`
- `packages/` for shared utilities

Do not read or modify files in `platform/`, `mobile/`, `sdks/`, `hasura/`, or `rootstock/`.
