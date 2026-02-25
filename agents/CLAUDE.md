# Agents — AI Agent Development

## Overview

This folder contains Papaya's AI agents deployed via SST to AWS. Agents handle claims processing, FWA detection, and other AI-powered workflows across all markets and insurance products.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js (deployed), Bun (local development)
- **Deployment**: SST on AWS (Lambda, Step Functions, or ECS depending on agent type)
- **LLM Access**: Anthropic Claude API (primary), with fallback providers as needed
- **Database**: PostgreSQL via Hasura GraphQL API
- **Queue/Events**: AWS SQS / EventBridge

## Folder Structure

```
agents/
├── CLAUDE.md
├── <agent-name>/          # Each agent is a self-contained sub-folder
│   ├── handler.ts         # Entry point (Lambda handler or main function)
│   ├── agent.ts           # Agent logic — tool definitions, system prompt, orchestration
│   ├── tools/             # Tool implementations the agent can call
│   ├── prompts/           # System prompts and prompt templates
│   ├── types.ts           # Agent-specific types
│   └── tests/             # Agent tests
```

## Agent Development Rules

### Structure

- Each agent is a self-contained folder — all its logic, tools, prompts, and types live within it
- Agents communicate with the database exclusively through the Hasura GraphQL API (via `@papaya/api-client` or direct GraphQL queries)
- Agents never access the database directly via SQL
- Shared utilities across agents go in `packages/`

### Agentic Workflow Patterns

- Agents use a tool-calling loop: receive input → reason → call tools → observe → repeat until done
- Every tool call must be idempotent — agents may retry on failure
- Agents must log every decision point (tool call, reasoning step, final output) for audit trail
- Use structured outputs (JSON) for all agent-to-system communication
- Human-readable explanations are generated alongside structured outputs for the UI

### Error Handling

- Agents must have a maximum iteration limit to prevent infinite loops
- Failed tool calls trigger retry with exponential backoff (max 3 retries)
- If an agent cannot complete its task, it must return a structured error with context, not crash silently
- Auto-fallback: if the agentic path fails, fall back to the previous LLM-infused (non-agentic) logic where available

### Testing

- Every agent needs integration tests with mocked LLM responses
- Tool functions are unit tested independently
- Use deterministic test cases with known-good inputs and expected outputs
- Test the fallback path (agent failure → graceful degradation)

### Deployment

- Agents are deployed via SST — each agent maps to an SST construct
- Environment variables for LLM API keys, Hasura endpoint, and feature flags are managed in SST config
- Agents follow the backward compatibility rules from root `CLAUDE.md` — new agent versions run alongside old ones during rollout

## Work Scope

When working in this folder, only reference:
- Files within `agents/`
- Root `tsconfig.json` and `package.json`
- `packages/` for shared utilities

Do not read or modify files in `platform/`, `hasura/`, or `rootstock/`.
