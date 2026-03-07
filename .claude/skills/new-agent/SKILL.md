---
name: new-agent
description: |
  Create a new AI agent in agents/.
  Use when: building a new agent for claims, FWA, underwriting, or other workflows.
  Scaffolds folder structure, tools, system prompt, handler, and tests.
---

# New Agent Scaffold

See `agents/CLAUDE.md` for agent creation patterns, tool conventions, system prompts, and events.

## Checklist

### 1. Folder

Create `agents/<name>/` with this structure:

```
agents/<name>/
  handler.ts          # Entry point (Lambda handler or main function)
  agent.ts            # Agent factory — system prompt, tools, loop config
  tools/
    <domain>.ts       # One file per domain (claims, documents, etc.)
    index.ts          # Barrel export
  prompts/            # System prompts and prompt templates (optional)
  types.ts            # Agent-specific types
  tests/              # Integration + unit tests
```

### 2. Tools (`tools/<domain>.ts`)

- [ ] Define tools with TypeBox schemas — every param has a `description`
- [ ] Use `label` for UI display during execution
- [ ] Return structured data in `content` and `details`
- [ ] Make all tools idempotent (safe to retry)
- [ ] Group related tools by domain (claims.ts, documents.ts, etc.)

### 3. Agent (`agent.ts`)

- [ ] Async factory function: `export async function create<Name>Agent(params)`
- [ ] Pre-fetch context in factory (policies, documents, enums) before constructing
- [ ] Structured system prompt with `dedent` (Role, Goal, Rules, Steps, Output)
- [ ] Set thinking level appropriate to complexity: `"low"` / `"medium"` / `"high"`
- [ ] Subscribe to events for logging and audit trail

### 4. Handler (`handler.ts`)

- [ ] Wire agent to Lambda / Step Functions / ECS entry point
- [ ] Parse and validate input
- [ ] Handle errors with structured responses
- [ ] Log completion metrics

### 5. Tests (`tests/`)

- [ ] Integration test with mocked LLM responses (mock `Agent` class, not real models)
- [ ] Unit tests for each tool's `execute` function
- [ ] Test error and fallback paths
- [ ] Follow red/green TDD — write failing tests first (RED phase), then implement

### 6. Config

- [ ] Add SST construct in `sst.config.ts` for deployment
- [ ] Configure environment variables (AWS_PROFILE, HASURA_GRAPHQL_ENDPOINT, etc.)
- [ ] Set up monitoring/alerting

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Bedrock access |
| `AWS_REGION` | Bedrock region (default: `ap-southeast-1`) |
| `HASURA_GRAPHQL_ENDPOINT` | Hasura DDN Cloud API URL |
| `HASURA_ADMIN_TOKEN` | Pre-signed JWT for DDN Cloud auth |

Do NOT use `ANTHROPIC_API_KEY`. All Claude access goes through Bedrock.
