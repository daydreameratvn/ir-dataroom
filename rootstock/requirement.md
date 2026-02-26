
# Project Requirements: 100% Self-Hosted Hasura DDN (v3) on AWS via Pulumi

## 1. Project Overview

**Objective:** Architect and implement a 100% self-hosted deployment of Hasura DDN (v3) on AWS using Pulumi (TypeScript).
**Region:** `ap-southeast-1` (Singapore)
**Target Environment:** 1 Production Environment (`prod`).
**IaC Tool:** Pulumi (TypeScript) with an S3 backend for state management.
**AWS Profile:** `banyan` — all AWS operations use this named profile.

### Critical Hasura v3 Context

Unlike Hasura v2, Hasura DDN (v3) has a distributed architecture and **does not require a Postgres metadata database**. The architecture consists of two distinct components that communicate over HTTP:

1. **The Engine (`ghcr.io/hasura/v3-engine`):** Orchestrates GraphQL queries and routing. Exposed to the public via an Application Load Balancer. Health endpoint: `/health`.
2. **The Native Data Connector (`ghcr.io/hasura/ndc-postgres`):** The agent that translates engine requests into SQL. Talks directly to the PostgreSQL database.

> **Note:** Both Hasura images are hosted on GitHub Container Registry (`ghcr.io`), not Docker Hub. They are distroless (no shell), so configuration files must be injected via init containers using shared ephemeral volumes.

---

## 2. Infrastructure Architecture & Scope

### 2.1 Networking & VPC

Create a multi-AZ network foundation spanning 2 Availability Zones (`ap-southeast-1a`, `ap-southeast-1b`).

* **VPC:** CIDR `10.68.0.0/16` with DNS support and DNS hostnames enabled.
* **Subnet Tiers:**

| Subnet | CIDR | AZ | Type | Purpose |
|--------|------|----|------|---------|
| banyan-prod-public-1a | 10.68.0.0/24 | 1a | Public | ALB, NAT Gateway |
| banyan-prod-public-1b | 10.68.1.0/24 | 1b | Public | ALB |
| banyan-prod-private-1a | 10.68.10.0/24 | 1a | Private | ECS Fargate |
| banyan-prod-private-1b | 10.68.11.0/24 | 1b | Private | ECS Fargate |
| banyan-prod-isolated-1a | 10.68.20.0/24 | 1a | Isolated | RDS |
| banyan-prod-isolated-1b | 10.68.21.0/24 | 1b | Isolated | RDS |

* **NAT Gateway:** Single NAT Gateway in `public-1a` (cost optimization, ~$43/month savings vs. 2 NAT Gateways). Both private subnets route through it.
* **Internet Gateway:** Attached to VPC for public subnet internet access.
* **Isolated Subnets:** No internet route whatsoever — RDS only.

* **Service Discovery:** AWS Cloud Map with a private DNS namespace `ddn.internal`. The Engine communicates with the NDC Connector at `ndc-banyan-postgres.ddn.internal:8080`, avoiding the ALB for internal traffic.

### 2.2 Security Groups (Zero-Trust Referencing)

No CIDR blocks for internal traffic — use Security Group referencing exclusively.

| SG | Inbound Rule | Source |
|----|-------------|--------|
| `banyan-prod-alb-sg` | TCP 80, 443 | 0.0.0.0/0 |
| `banyan-prod-engine-sg` | TCP 3000 | ALB SG |
| `banyan-prod-ndc-sg` | TCP 8080 | Engine SG |
| `banyan-prod-rds-sg` | TCP 5432 | NDC SG, Bastion SG |
| `banyan-prod-bastion-sg` | (none — SSM only) | — |

All security groups allow all outbound traffic (required for NAT, ECR image pulls, DNS, SSM).

### 2.3 Bastion Host (SSM Tunnel)

* **Purpose:** SSM port-forwarding tunnel to reach RDS in isolated subnets (for migrations, manual queries).
* **Instance:** `t4g.nano` (ARM64, Amazon Linux 2023 standard AMI with SSM agent pre-installed).
* **Placement:** Private subnet (`banyan-prod-private-1a`).
* **Security Group:** `banyan-prod-bastion-sg` — no inbound rules, all outbound (SSM via NAT + RDS).
* **IAM:** Instance profile with `AmazonSSMManagedInstanceCore` managed policy.
* **Access:** No SSH — access exclusively via AWS SSM Session Manager.
* **Tunnel command:** `AWS_PROFILE=banyan bun run hasura:tunnel` (forwards `localhost:15432` to RDS port `5432`).

### 2.4 Database Layer (Amazon RDS)

* **Engine:** Amazon RDS for PostgreSQL 16.
* **Instance Class:** `db.t4g.medium` (ARM/Graviton, cost-effective).
* **Deployment:** Single-AZ (cost optimization; can enable Multi-AZ later for HA).
* **Storage:** 50 GB `gp3` with encryption enabled (AWS-managed KMS key).
* **Backup:** 7-day retention, deletion protection enabled.
* **Credentials:** Random 32-character password generated via `@pulumi/random`. Connection details stored in **AWS Secrets Manager** as JSON:

  ```json
  {
    "username": "banyanadmin",
    "password": "<generated>",
    "host": "<rds-endpoint>",
    "port": "5432",
    "dbname": "banyan",
    "connection_uri": "postgresql://banyanadmin:<password>@<host>:5432/banyan"
  }
  ```

  The secret version is created after RDS to include the actual endpoint via `pulumi.all()`.

### 2.5 Compute Layer (Amazon ECS Fargate)

ECS Cluster `banyan-prod-cluster` with Container Insights enabled. Two CloudWatch log groups with 30-day retention: `/ecs/banyan-prod/engine` and `/ecs/banyan-prod/ndc`.

#### Init Container Pattern

Both Hasura images are distroless (no shell). Configuration files are injected using init containers with shared ephemeral volumes:

* **NDC Connector:** Uses `busybox` to write config, then `ndc-postgres-cli` to introspect the database.
* **Engine:** Uses `aws-cli` to write auth config (with JWT secret injection via `sed`) and download metadata from S3.
* Main containers read from the mounted volume via `dependsOn` with `condition: "SUCCESS"`.

#### Service A: Hasura NDC Postgres Connector

* **Image:** `ghcr.io/hasura/ndc-postgres:v3.0.0`
* **Resources:** 256 CPU / 512 MB memory.
* **Desired Count:** 2 tasks.
* **Placement:** Private Subnets.
* **Port:** Container port `8080`.
* **Cloud Map:** Registered as `ndc-banyan-postgres.ddn.internal`.
* **Init Container Chain (3 containers):**
  1. **`init-ndc-config`** (`busybox`): Writes `/etc/connector/configuration.json`:

     ```json
     {
       "version": "5",
       "connectionSettings": {
         "connectionUri": { "variable": "CONNECTION_URI" }
       }
     }
     ```

  2. **`init-ndc-introspect`** (`ghcr.io/hasura/ndc-postgres:v3.0.0`): Runs `ndc-postgres-cli update` to introspect the live database and generate `/etc/connector/metadata.json`. This ensures the NDC connector has an up-to-date schema snapshot on every deployment. Uses entrypoint `/bin/ndc-postgres-cli` with command `["update"]`.
  3. **`ndc-postgres`** (main): Starts the connector, depends on `init-ndc-introspect` completing successfully.
* **Secrets:** `CONNECTION_URI` injected from Secrets Manager ARN (`<secretArn>:connection_uri::`) — used by both the introspect init container and the main container.

#### Service B: Hasura v3 Engine

* **Image:** `ghcr.io/hasura/v3-engine:latest`
* **Resources:** 512 CPU / 1024 MB memory.
* **Desired Count:** 2 tasks.
* **Placement:** Private Subnets.
* **Port:** Container port `3000`.
* **Load Balancing:** Attached to the public ALB target group.
* **Init Container** (`public.ecr.aws/aws-cli/aws-cli:latest`): Writes `auth_config.json` with JWT secret injection and downloads metadata files from S3:
  1. Writes `auth_config.json` — JWT mode (HS256, v2 format) with `__JWT_SECRET_KEY__` placeholder, then uses `sed` to replace with the actual key from Secrets Manager:

     ```json
     {
       "version": "v2",
       "definition": {
         "mode": {
           "jwt": {
             "claimsConfig": {
               "namespace": {
                 "claimsFormat": "Json",
                 "location": "/https:~1~1hasura.io~1jwt~1claims"
               }
             },
             "key": { "fixed": { "algorithm": "HS256", "key": "<injected at deploy>" } },
             "tokenLocation": { "type": "BearerAuthorization" }
           }
         }
       }
     }
     ```

  2. Downloads `open_dd.json` from `s3://banyan-hasura-metadata/open_dd.json` — the OpenDD supergraph metadata (DataConnectorLink, Models, Relationships, Permissions, etc.).
  3. Downloads `metadata.json` from `s3://banyan-hasura-metadata/metadata.json` — the NDC introspection metadata.
* **Secrets:** `JWT_SECRET_KEY` injected from Secrets Manager ARN (`<jwtSecretArn>:key::`).
* **CLI Arguments:**

  ```
  --metadata-path /md/open_dd.json
  --authn-config-path /md/auth_config.json
  --otlp-endpoint http://0.0.0.0:4318
  --port 3000
  ```

* **Environment:** `ENABLE_CORS=true`.

### 2.6 Application Load Balancer

* **Type:** Public-facing, application load balancer in public subnets.
* **Domain:** `prod.banyan.services.papaya.asia` (DNS managed in a separate AWS account).
* **Target Group:** Port 3000, IP target type, health check on `/health` (matcher: `200-299`, interval: 15s, healthy threshold: 2, unhealthy threshold: 3).
* **HTTP Listener (port 80):** 301 redirect to HTTPS.
* **HTTPS Listener (port 443):** TLS 1.3 (`ELBSecurityPolicy-TLS13-1-2-2021-06`), ACM certificate for `prod.banyan.services.papaya.asia` (DNS-validated), forwards to engine target group.

### 2.7 ACM Certificate

* **Domain:** `prod.banyan.services.papaya.asia` + SAN `*.banyan.services.papaya.asia`.
* **Validation:** DNS (CNAME record must be added manually in the Route 53 hosted zone in the other AWS account).
* **CertificateValidation resource** blocks deployment until the cert is validated.

### 2.8 Auth Service (ECS Fargate)

* **Image:** `812652266901.dkr.ecr.ap-southeast-1.amazonaws.com/banyan-auth:latest`
* **ECR Repository:** `banyan-auth` (lifecycle policy: keep last 10 untagged images)
* **Resources:** 256 CPU / 512 MB memory.
* **Desired Count:** 2 tasks.
* **Port:** Container port `4000`.
* **Health Check:** `/auth/health` on port 4000.
* **Load Balancing:** ALB listener rule `/auth/*` (priority 100, both HTTP and HTTPS listeners).
* **Security Group:** `banyan-prod-auth-sg` — inbound TCP 4000 from ALB SG, outbound all.
* **IAM Permissions:** SES, SNS, SSM, Bedrock (InvokeModel, InvokeModelWithResponseStream).

### 2.9 Frontend Hosting (CloudFront + S3)

* **S3 Bucket:** `banyan-prod-frontend` — private, OAC access only.
* **CloudFront Distribution:** `d2y563mglh62j8.cloudfront.net` (E1SZ4G9NL7U0ZA)
  * S3 origin (default): Static assets via OAC.
  * ALB origin (`/auth/*`): HTTP origin, CachingDisabled + AllViewer policies.
  * SPA routing: 403/404 → `/index.html`.
  * PriceClass_200, HTTP/2+3, CloudFront default certificate.

### 2.10 S3 Metadata Bucket

* **Bucket:** `banyan-hasura-metadata` (created manually, not managed by Pulumi).
* **Purpose:** Stores the Hasura OpenDD metadata files that the engine loads at startup.
* **Files:**
  * `open_dd.json` — OpenDD supergraph metadata (DataConnectorLink, Models, ObjectTypes, Relationships, Permissions, ScalarTypes, etc.).
  * `metadata.json` — NDC connector introspection metadata.
* **Deployment Flow:** The `hasura:deploy` script uploads these files to S3, then triggers ECS service restarts. The engine init container downloads them from S3 at task startup.
* **Access:** ECS task role has `s3:GetObject` permission scoped to `arn:aws:s3:::banyan-hasura-metadata/*`.

### 2.11 JWT Authentication

* **HMAC Key:** Random 32-byte key generated via `@pulumi/random` `RandomBytes`, base64-encoded.
* **Secret Storage:** Secrets Manager (`banyan-prod-jwt-secret`) stores `{ "key": "<base64>" }`.
* **Admin Token:** A pre-signed JWT (HS256, 100-year expiry) with `x-hasura-default-role: admin` is generated at deploy time using `jose` and stored in SSM at `/banyan/hasura/admin-token`.
* **Engine Integration:** The init container receives the HMAC key via ECS secret injection and replaces the `__JWT_SECRET_KEY__` placeholder in `auth_config.json` using `sed`.

---

## 3. IAM Roles

* **Execution Role (`banyan-prod-ecs-exec-role`):** Assumed by ECS agent. Permissions:
  * `AmazonECSTaskExecutionRolePolicy` (managed policy for ECR pulls, CloudWatch logs).
  * Inline policy for Secrets Manager read access (`secretsmanager:GetSecretValue`) scoped to the DB secret ARN and JWT secret ARN.
* **Task Role (`banyan-prod-ecs-task-role`):** Assumed by the running containers. Permissions:
  * S3 read access (`s3:GetObject`) scoped to `arn:aws:s3:::banyan-hasura-metadata/*` — allows the engine init container to download metadata files from S3.

---

## 4. Pulumi Configuration & State

### 4.1 Backend Configuration

* **S3 Backend:** `s3://banyan-pulumi-state-bucket?region=ap-southeast-1`
* **Project Name:** `banyan-ddn`
* **Stack:** `prod`
* **Passphrase:** Stored in AWS Systems Manager Parameter Store as `SecureString` at `/banyan/pulumi/config-passphrase`. Retrieved dynamically — never hard-coded.

### 4.2 AWS Provider

The AWS provider explicitly uses the `banyan` profile:

```typescript
new aws.Provider("banyan-aws-provider", {
  region: "ap-southeast-1",
  profile: "banyan",
});
```

### 4.3 Pulumi Config Keys

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `awsRegion` | yes | — | AWS region (`ap-southeast-1`) |
| `environment` | no | `prod` | Environment name |
| `vpcCidr` | no | `10.50.0.0/16` | VPC CIDR block |
| `dbInstanceClass` | no | `db.t4g.medium` | RDS instance class |
| `dbAllocatedStorage` | no | `50` | RDS storage in GB |
| `dbName` | no | `banyan` | PostgreSQL database name |
| `ecsEngineCpu` | no | `512` | Engine task CPU units |
| `ecsEngineMemory` | no | `1024` | Engine task memory (MB) |
| `ecsNdcCpu` | no | `256` | NDC task CPU units |
| `ecsNdcMemory` | no | `512` | NDC task memory (MB) |
| `metadataBucket` | yes | — | S3 bucket for Hasura metadata (`banyan-hasura-metadata`) |
| `domainName` | yes | — | Domain for the engine ALB (`prod.banyan.services.papaya.asia`) |

### 4.4 Stack Outputs

Upon successful `pulumi up`, the stack exports:

* `VpcId`: The ID of the created VPC.
* `AlbDnsName`: The public DNS name to access the Hasura v3 Engine.
* `RdsEndpoint`: The private endpoint of the PostgreSQL database.
* `SecretArn`: The ARN of the Secrets Manager secret holding the DB credentials.
* `BastionInstanceId`: The EC2 instance ID of the SSM bastion host.
* `DomainName`: The domain name for the Hasura engine (`prod.banyan.services.papaya.asia`).
* `CertificateArn`: The ARN of the ACM certificate.
* `CertValidationCname`: The DNS CNAME record(s) needed for certificate validation.

---

## 5. File Structure

```
rootstock/
├── index.ts                     # Entry point, stack outputs
├── config.ts                    # Centralized pulumi.Config
├── Pulumi.yaml                  # S3 backend config
├── Pulumi.prod.yaml             # Stack config values (aws:profile: banyan)
├── AGENTS.md                    # Agent instructions
├── CLAUDE.md                    # Points to AGENTS.md
├── requirement.md               # This file
├── providers/
│   └── aws.ts                   # AWS provider (profile: banyan)
├── lib/
│   ├── types.ts                 # TypeScript interfaces
│   ├── tags.ts                  # Standard tags (Project: banyan-ddn)
│   └── utils.ts                 # getRegion, getEnv, logResource
└── resources/
    ├── index.ts                 # Re-exports all resource modules
    ├── vpc.ts                   # VPC, IGW, NAT, subnets, route tables
    ├── security-groups.ts       # 5 SGs in zero-trust chain
    ├── bastion.ts               # SSM bastion (t4g.nano, IAM, SG)
    ├── rds.ts                   # Random password, Secrets Manager, RDS instance
    ├── ecs-cluster.ts           # ECS cluster, CloudWatch log groups
    ├── ecs-iam.ts               # Execution role, task role, policies
    ├── cloud-map.ts             # Private DNS namespace (ddn.internal)
    ├── acm.ts                   # ACM certificate + DNS validation
    ├── jwt.ts                   # JWT HMAC key, Secrets Manager, admin token, SSM
    ├── alb.ts                   # ALB, target group, HTTP redirect, HTTPS listener
    ├── ecs-ndc-connector.ts     # NDC task def + service + Cloud Map
    └── ecs-engine.ts            # Engine task def + service + ALB + JWT injection
```

---

## 6. Cost Estimate (~$221/month)

| Component | Monthly | % of Total |
|-----------|---------|-----------|
| RDS PostgreSQL (db.t4g.medium + 50GB gp3) | $81.36 | 37% |
| ECS Fargate (4 tasks: 2 engine + 2 ndc) | $67.47 | 31% |
| NAT Gateway (1 NAT + ~10GB data) | $43.66 | 19% |
| ALB (hourly + ~1 LCU) | $24.24 | 11% |
| Bastion (t4g.nano, on-demand) | $3.07 | 1% |
| ACM Certificate | $0.00 | 0% |
| Other (Secrets Manager, Cloud Map, CloudWatch, SSM) | $1.80 | <1% |
| **Total** | **~$221/mo** | |

**Exclusions:** Data transfer, RDS backup beyond free tier.

**Cost optimization paths:** RDS Reserved Instance (~30-40% savings), Fargate Savings Plans (~20%), reduce to 1 task per service (~50% Fargate savings).
