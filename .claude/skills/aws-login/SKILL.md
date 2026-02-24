---
name: aws-login
description: |
  Use this skill when a command or script fails with AWS authentication errors.
  Triggers on errors like: session expired, credentials not found, UnauthorizedAccess,
  ExpiredToken, InvalidIdentityToken, or similar AWS auth failures.
  Logs in and exports temporary credentials to environment variables.
---

# AWS Login & Credential Export Skill

**IMPORTANT**: Use this skill when you encounter AWS authentication errors such as:

- `Your session has expired`
- `Unable to locate credentials`
- `ExpiredToken` / `ExpiredTokenException`
- `InvalidIdentityToken`
- `UnauthorizedAccess`
- `The security token included in the request is expired`
- `Could not load credentials from any providers`

## Purpose

Re-authenticate with AWS and export credentials when a command fails due to expired or missing AWS session.

## Steps

### 1. Login to AWS

Run AWS login:

```bash
aws login
```

**Note**: Use `aws login`, NOT `aws sso login`. This will open a browser for authentication.

Wait for login to complete successfully before proceeding.

### 2. Export Credentials to Environment (Only for SDK-based Tools)

This step is **only necessary** for tools that use the AWS SDK under the hood (e.g., Pulumi, SST, CDK, Terraform, Serverless Framework, or any custom script using the AWS SDK). AWS CLI commands work directly with the configured profile after `aws login` and do **not** need this step.

Export temporary credentials so AWS SDK can use them:

```bash
eval $(aws configure export-credentials --profile default --format env)
```

This sets the following environment variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`

### 3. Retry the Failed Command

After login (and credential export if needed), retry the command that originally failed.

**For AWS CLI commands** — just retry directly after `aws login`:

```bash
aws s3 ls
aws ssm get-parameter --name my-param --with-decryption --query Parameter.Value --output text
```

**For SDK-based tools** — chain the eval command with the retry command using `&&`:

```bash
eval $(aws configure export-credentials --profile default --format env) && <original-command>
```

## Examples

AWS CLI command failed (no credential export needed):

```bash
aws login
# then retry directly
aws s3 ls
```

IaC / SDK-based tool failed with auth error:

```bash
eval $(aws configure export-credentials --profile default --format env) && pulumi up
eval $(aws configure export-credentials --profile default --format env) && sst deploy
eval $(aws configure export-credentials --profile default --format env) && cdk deploy
eval $(aws configure export-credentials --profile default --format env) && bun run my-script.ts
```

## Rules

- **ONLY** use this skill when an AWS authentication error occurs
- **NEVER** store or log the actual credential values
- **CREDENTIAL EXPORT** is only needed for tools using the AWS SDK (IaC tools, custom scripts, etc.), not for AWS CLI commands
- **CHAIN** the eval command with the retry command using `&&` to ensure credentials are in the same shell session (when credential export is needed)
- **RETRY** the original failed command after exporting credentials
