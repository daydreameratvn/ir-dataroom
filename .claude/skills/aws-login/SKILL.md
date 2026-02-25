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
- `NoCredentialProviders`

## Purpose

Re-authenticate with the **banyan** AWS profile and export credentials when a command fails due to expired or missing AWS session.

## Steps

### 1. Login to AWS

Run AWS login with the **banyan** profile:

```bash
aws login --profile banyan
```

**Note**: Use `aws login`, NOT `aws sso login`. This will open a browser for authentication.

Wait for login to complete successfully before proceeding.

### 2. Verify Correct AWS Account

After login, verify you are authenticated to the correct AWS account:

```bash
AWS_PROFILE=banyan aws sts get-caller-identity --query Account --output text
```

- **Expected account**: `812652266901`
- If the returned account ID is **not** `812652266901`, **STOP immediately** and alert the user:
  > "Wrong AWS account. Expected `812652266901` (banyan) but got `<actual-account-id>`. Please check your AWS SSO configuration for the `banyan` profile and re-login to the correct account."
- **Do NOT proceed** with credential export or retry if the account is wrong.

### 3. Export Credentials to Environment (Only for SDK-based Tools)

This step is **only necessary** for tools that use the AWS SDK under the hood (e.g., Pulumi, SST, CDK, Terraform, Serverless Framework, or any custom script using the AWS SDK). AWS CLI commands work directly with the configured profile after `aws login` and do **not** need this step.

Export temporary credentials so AWS SDK can use them:

```bash
eval $(aws configure export-credentials --profile banyan --format env)
```

This sets the following environment variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`

### 4. Retry the Failed Command

After login, account verification, and credential export (if needed), retry the command that originally failed.

**For AWS CLI commands** — just retry directly after `aws login`:

```bash
AWS_PROFILE=banyan aws s3 ls
AWS_PROFILE=banyan aws ssm get-parameter --name my-param --with-decryption --query Parameter.Value --output text
```

**For SDK-based tools** — chain the eval command with the retry command using `&&`:

```bash
eval $(aws configure export-credentials --profile banyan --format env) && <original-command>
```

## Examples

AWS CLI command failed (no credential export needed):

```bash
aws login --profile banyan
# Verify correct account
AWS_PROFILE=banyan aws sts get-caller-identity --query Account --output text
# Expected: 812652266901
# Then retry
AWS_PROFILE=banyan aws s3 ls
```

IaC / SDK-based tool failed with auth error:

```bash
aws login --profile banyan
# Verify correct account
AWS_PROFILE=banyan aws sts get-caller-identity --query Account --output text
# Expected: 812652266901
# Then export and retry
eval $(aws configure export-credentials --profile banyan --format env) && pulumi up
eval $(aws configure export-credentials --profile banyan --format env) && sst deploy
eval $(aws configure export-credentials --profile banyan --format env) && bun run my-script.ts
```

## Rules

- **ONLY** use this skill when an AWS authentication error occurs
- **ALWAYS** use the `banyan` profile — never use `default` or any other profile
- **ALWAYS** verify the AWS account is `812652266901` after login — do not proceed if the account is wrong
- **NEVER** store or log the actual credential values
- **CREDENTIAL EXPORT** is only needed for tools using the AWS SDK (IaC tools, custom scripts, etc.), not for AWS CLI commands
- **CHAIN** the eval command with the retry command using `&&` to ensure credentials are in the same shell session (when credential export is needed)
- **RETRY** the original failed command after exporting credentials
