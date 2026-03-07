---
description: Agent development patterns reminder
paths:
  - "agents/**"
---

# Agent Development

Load the `agents-dev` skill when:
- Creating a new agent or adding tools to an existing agent
- Writing or modifying a system prompt
- Implementing tool `execute` functions or tool factories
- Handling agent events or building agent-to-agent calls
- Unsure about pi-mono patterns (Agent class, createAgentSession, TypeBox schemas)

Load the `new-agent` skill when:
- Scaffolding a brand-new agent folder from scratch

Skip both skills when:
- Only reading agent code to understand it (no changes)
- Modifying tests, config files, or deployment scripts unrelated to agent logic
