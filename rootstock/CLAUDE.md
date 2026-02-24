# Banyan DDN Agent Guidelines

This file contains instructions for AI agents working in the `rootstock` directory.

## Project Context

- **Type**: Monorepo sub-app for Infrastructure as Code (IaC).
- **Language**: TypeScript.
- **Runtime & Package Manager**: Bun.
- **Configuration**: Uses the root `tsconfig.json` and `package.json`.
- **AWS Profile**: Always use the `banyan` AWS profile.

## Code Generation Rules

- **Location**: All generated code must be placed inside the `rootstock/` directory.
- **Exceptions**: You are allowed to update the following files in the root directory if necessary:
  - `package.json`
  - `tsconfig.json`

## Requirement Documentation

- **File**: `rootstock/requirement.md` is the single source of truth for what is deployed.
- **Keep in sync**: Whenever you make changes to the infrastructure — adding resources, modifying configuration, changing requirements, updating images, adjusting sizing, adding features, etc. — you **must** also update `requirement.md` to reflect those changes.
- **What to update**: Resource specs, CIDR ranges, instance types, container images/tags, ECS sizing, security group rules, IAM policies, cost estimates, file structure, stack outputs, and any other details that affect the deployed state.

## Configuration Management

### Pulumi Backend

- **Backend**: S3 (`s3://banyan-pulumi-state-bucket?region=ap-southeast-1`)
- **Stack**: `prod`
- **Project**: `banyan-ddn`
- **AWS Profile**: `banyan`

### Running Pulumi Commands

Always use the `banyan` AWS profile:

```bash
AWS_PROFILE=banyan pulumi preview
AWS_PROFILE=banyan pulumi up
AWS_PROFILE=banyan pulumi stack
```

### Passphrase for Stack Secrets

The passphrase is stored in AWS Systems Manager Parameter Store as a `SecureString`:

- **Parameter**: `/banyan/pulumi/config-passphrase`
- **Region**: `ap-southeast-1`

Retrieve it dynamically before running Pulumi commands. **Never hard-code or remember the passphrase.**

```bash
export PULUMI_CONFIG_PASSPHRASE=$(AWS_PROFILE=banyan aws ssm get-parameter --name /banyan/pulumi/config-passphrase --with-decryption --region ap-southeast-1 --query Parameter.Value --output text)
```

### Full Pulumi Command Pattern

Combine credential export and passphrase retrieval in a single chain:

```bash
export PULUMI_CONFIG_PASSPHRASE=$(AWS_PROFILE=banyan aws ssm get-parameter --name /banyan/pulumi/config-passphrase --with-decryption --region ap-southeast-1 --query Parameter.Value --output text) && eval $(aws configure export-credentials --profile banyan --format env) && pulumi up --yes
```

## Troubleshooting & Common Issues

### AWS Credential Errors

**Error**: `NoCredentialProviders` or similar.

**Solution**:

```bash
eval $(aws configure export-credentials --profile banyan --format env) && <your-pulumi-command>
```

**Important**: Always chain the credential export with the command using `&&`.

**Note**: The `eval $(aws configure export-credentials ...)` step is only necessary for tools that use the AWS SDK under the hood (e.g., Pulumi, SST). AWS CLI commands (e.g., `aws ssm get-parameter`, `aws s3 ls`) work directly with the configured profile and do not require this step.
