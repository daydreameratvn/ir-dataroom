# Project Context

This is a monorepo for building Agents.

## Tech Stack

- **Language**: TypeScript
- **Local Runtime**: Bun
- **Package Manager**: Bun
- **Server Runtime**: Node.js
- **Cloud Provider**: AWS
- **IaC**: Pulumi for permanent infrastructure (VPC, subnets, RDS); SST for application (agent) deployment
- **Agent Coding**: Claude Code
- **Code Management**: Git & GitHub

## Folder Structure

```
/banyan
├── .github/workflows      # CI/CD (GitHub Actions)
├── .claude/               # Claude Code settings
├── agents/                # Agents
├── rootstock/             # Pulumi: VPC, RDS (PostgreSQL), IAM, S3 (Documents)
├── hasura/                # Hasura DDN (v3)
├── packages/              # Shared packages
├── bun.lockb
├── package.json
```

## Rules

- **Shared Configuration**: Sub-apps use the root `tsconfig.json` and `package.json` instead of maintaining their own.
- **Work Scope**: When working in a particular sub-app folder, do not read code in other folders. Only the root `tsconfig.json` or `package.json` may be relevant.
