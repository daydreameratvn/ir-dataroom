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

## Infrastructure Overview

- **File**: `rootstock/overview.md` is the single source of truth for what is deployed.
- **Keep in sync**: Whenever you make changes to the infrastructure — adding resources, modifying configuration, changing requirements, updating images, adjusting sizing, adding features, etc. — you **must** also update `overview.md` to reflect those changes.
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

### PULUMI_CONFIG_PASSPHRASE

The Pulumi state uses **passphrase-based encryption** for secrets. The `PULUMI_CONFIG_PASSPHRASE` environment variable **must** be set for any Pulumi command that reads or writes encrypted config values.

**Where it's stored**: AWS SSM Parameter Store as `SecureString`
- **Parameter**: `/banyan/pulumi/config-passphrase`
- **Region**: `ap-southeast-1`

**When it's required** (will fail with `passphrase must be set` or `incorrect passphrase` without it):
- `pulumi up` / `pulumi preview` — reads encrypted config values during execution
- `pulumi config set --secret` — encrypts new secret values
- `pulumi config get` — decrypts secret values
- `pulumi stack export` / `pulumi stack import` — handles encrypted state
- Any command that touches a stack with `secure:` values in `Pulumi.<stack>.yaml`

**When it's NOT required**:
- `pulumi stack ls` — just lists stacks
- `pulumi whoami` — shows identity
- `pulumi cancel` — cancels a pending operation (no state decryption)

**How to use** — retrieve dynamically, never hard-code:

```bash
export PULUMI_CONFIG_PASSPHRASE=$(AWS_PROFILE=banyan aws ssm get-parameter --name /banyan/pulumi/config-passphrase --with-decryption --region ap-southeast-1 --query Parameter.Value --output text)
```

### Full Pulumi Command Pattern

Combine passphrase retrieval + AWS credential export in a single chain:

```bash
export PULUMI_CONFIG_PASSPHRASE=$(AWS_PROFILE=banyan aws ssm get-parameter --name /banyan/pulumi/config-passphrase --with-decryption --region ap-southeast-1 --query Parameter.Value --output text) && eval $(aws configure export-credentials --profile banyan --format env) && pulumi up --yes
```

**Important**: Both parts are needed — `PULUMI_CONFIG_PASSPHRASE` for secret decryption, `eval $(aws configure export-credentials ...)` for AWS SDK access. Chain with `&&` so failures stop the pipeline.

## GCP Authentication

The GCP provider uses Application Default Credentials. Before running Pulumi commands that touch GCP resources:

```bash
gcloud auth application-default login
```

This is separate from AWS credentials — both must be active for `pulumi up` to succeed.

## OAuth Secret Management

OAuth client credentials (Google, Microsoft, Apple) are stored as **Pulumi config secrets** — encrypted in Pulumi state, never in plaintext.

### Setting OAuth secrets

```bash
cd rootstock
export PULUMI_CONFIG_PASSPHRASE=$(AWS_PROFILE=banyan aws ssm get-parameter --name /banyan/pulumi/config-passphrase --with-decryption --region ap-southeast-1 --query Parameter.Value --output text)

pulumi config set --secret banyan-ddn:googleOAuthClientId <value>
pulumi config set --secret banyan-ddn:googleOAuthClientSecret <value>
pulumi config set --secret banyan-ddn:microsoftOAuthClientId <value>
pulumi config set --secret banyan-ddn:microsoftOAuthClientSecret <value>
pulumi config set --secret banyan-ddn:appleOAuthClientId <value>
pulumi config set --secret banyan-ddn:appleOAuthClientSecret <value>
```

These values flow through Pulumi into AWS SSM parameters at deploy time. Never set SSM values manually with `aws ssm put-parameter`.

### Google OAuth consent screen

External OAuth consent screen and web app client IDs must be created manually in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) for project `banyan-489002` (known Terraform/Pulumi limitation). Redirect URIs:
- `https://oasis.papaya.asia/auth/callback/google`
- `https://oasis.papaya.asia/auth/admin/directory/callback/google`

## Troubleshooting & Common Issues

### AWS Credential Errors

**Error**: `NoCredentialProviders` or similar.

**Solution**:

```bash
eval $(aws configure export-credentials --profile banyan --format env) && <your-pulumi-command>
```

**Important**: Always chain the credential export with the command using `&&`.

**Note**: The `eval $(aws configure export-credentials ...)` step is only necessary for tools that use the AWS SDK under the hood (e.g., Pulumi, SST). AWS CLI commands (e.g., `aws ssm get-parameter`, `aws s3 ls`) work directly with the configured profile and do not require this step.
