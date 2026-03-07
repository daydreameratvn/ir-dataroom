---
name: tdd
description: |
  Red/Green TDD protocol, test structure, naming conventions, and test commands.
  Use when: writing tests, making code changes, fixing bugs, adding features,
  or any task that involves modifying source code.
  Triggers on: test files, vitest, describe/it blocks, test commands,
  or when starting implementation of any code change.
---

# Testing — Red/Green TDD

**All code changes across every area MUST follow red/green TDD.** This applies to Claude Code agents (CI and local), human developers, and every PR.

## The Protocol

Every change follows this strict sequence:

1. **RED** — Write failing test(s) first. Run them. Confirm they fail.
2. **GREEN** — Write the minimum code to make tests pass. Run them. Confirm they pass.
3. **REFACTOR** — Clean up while keeping tests green. Run them again.

**Never skip the red phase.** A test that passes on first run may be testing the wrong thing. If a test already passes, either (a) keep it as documentation of existing behavior, or (b) tighten the assertion until it validates the actual new behavior. A test that cannot fail is worthless.

## Why This Matters for AI Agents

AI coding agents have three failure modes that TDD catches:
- **Code that doesn't work** — the green phase catches this
- **Tests that don't test anything** — the red phase catches this
- **Unnecessary code** — writing tests first scopes the implementation

## Test Structure

Group by behavior, not by method. Use descriptive names that read as specifications:

```typescript
describe("functionName", () => {
  describe("when given valid input", () => {
    it("should return the expected output", () => {
      // Arrange → Act → Assert
    });
  });
  describe("edge cases", () => {
    it("should handle empty input", () => { ... });
  });
});
```

Use `it.each()` for parameterized cases. Use `describe` blocks to group related behaviors.

## Test Naming

```typescript
// Good — describes behavior
it("should return partial result when sub-agent times out")
it("should embed claim code in system prompt")

// Bad — describes implementation
it("calls mockPrompt")
it("test timeout")
```

## Running Tests

```bash
# Platform (React)
cd platform && bun run test

# SDKs
cd sdks && bun run test

# Agents
cd agents && bunx vitest run

# Watch mode (agents)
cd agents && bunx vitest watch

# Run specific test file (agents)
cd agents && bunx vitest run path/to/file.test.ts
```

Always run the full area test suite before committing. Never commit with failing tests.

Area-specific conventions (mock strategy, framework details) are in each area's `CLAUDE.md`.
