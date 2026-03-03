
# Project Requirements: 100% Self-Hosted Hasura DDN (v3) on AWS via Pulumi

## 1. Project Overview

**Objective:** Architect and implement a 100% self-hosted deployment of Hasura DDN (v3) on AWS using Pulumi (TypeScript).
**Region:** `ap-southeast-1` (Singapore)
**Target Environment:** 1 Production Environment (`prod`).
**IaC Tool:** Pulumi (TypeScript) with an S3 backend for state management.
**AWS Profile:** `banyan` — all AWS operations use this named profile.

### Critical Hasura v3 Context

Unlike Hasura v2, Hasura DDN (v3) has a distributed architecture and **does not require a Postgres metadata database**. The architecture consists of two distinct components that communicate over HTTP:

1. **RDS PostgreSQL 17** — the database, in isolated subnets
2. **Doltgres** — logical replication subscriber for audit and version control (Fargate + EFS)
3. **NLB (Network Load Balancer)** — internet-facing TCP proxy allowing DDN Cloud connectors to reach RDS
4. **ALB (Application Load Balancer)** — public-facing HTTPS for the auth service
5. **ECS Fargate** — runs the auth API service and Doltgres services
6. **Bastion** — SSM tunnel for database access (migrations, debugging)
7. **Secrets** — JWT key, DB credentials, OAuth secrets, Doltgres replicator credentials

---

## 2. Infrastructure Architecture & Scope

### 2.1 Networking & VPC

Create a multi-AZ network foundation spanning 2 Availability Zones (`ap-southeast-1a`, `ap-southeast-1b`).

* **VPC:** CIDR `10.68.0.0/16` with DNS support and DNS hostnames enabled.
* **Subnet Tiers:**

| Subnet | CIDR | AZ | Type | Purpose |
|--------|------|----|------|---------|
| banyan-prod-public-1a | 10.68.0.0/24 | 1a | Public | ALB, NLB, NAT Gateway |
| banyan-prod-public-1b | 10.68.1.0/24 | 1b | Public | ALB, NLB |
| banyan-prod-private-1a | 10.68.10.0/24 | 1a | Private | ECS Fargate (auth, forensics, Doltgres) |
| banyan-prod-private-1b | 10.68.11.0/24 | 1b | Private | ECS Fargate (auth, forensics) |
| banyan-prod-isolated-1a | 10.68.20.0/24 | 1a | Isolated | RDS |
| banyan-prod-isolated-1b | 10.68.21.0/24 | 1b | Isolated | RDS |

* **NAT Gateway:** Single NAT Gateway in `public-1a` (cost optimization, ~$43/month savings vs. 2 NAT Gateways). Both private subnets route through it.
* **Internet Gateway:** Attached to VPC for public subnet internet access.
* **Isolated Subnets:** No internet route whatsoever — RDS only.
* **Service Discovery:** AWS Cloud Map with a private DNS namespace `ddn.internal`. Used for Doltgres internal service discovery:
  * `doltgres.ddn.internal:5432` — Doltgres logical replica

### 2.2 Security Groups (Zero-Trust Referencing)

No CIDR blocks for internal traffic — use Security Group referencing exclusively.

| SG | Inbound Rule | Source |
|----|-------------|--------|
| `banyan-prod-alb-sg` | TCP 80, 443 | 0.0.0.0/0 |
| `banyan-prod-rds-sg` | TCP 5432 | NLB SG, Bastion SG, Auth SG, Doltgres SG |
| `banyan-prod-bastion-sg` | (none — SSM only) | — |
| `banyan-prod-auth-sg` | TCP 4000 | ALB SG |
| `banyan-prod-forensics-sg` | TCP 4001 | ALB SG |
| `banyan-prod-forensics-gpu-host-sg` | (none — egress only) | — |
| `banyan-prod-nlb-sg` | TCP 5432 | 0.0.0.0/0 |
| `banyan-prod-doltgres-sg` | TCP 5432 | RDS SG, Bastion SG |
| `banyan-prod-doltgres-efs-sg` | TCP 2049 (NFS) | Doltgres SG |

All security groups allow all outbound traffic (required for NAT, ECR image pulls, DNS, SSM).

### 2.3 Bastion Host (SSM Tunnel)

* **Purpose:** Allow DDN Cloud-managed connectors to reach RDS in private/isolated subnets.
* **Type:** Network Load Balancer, internet-facing, TCP pass-through.
* **Placement:** Public subnets.
* **Listeners:**
  * **Port 5432 → RDS:** TCP pass-through. Target group (IP type) points at RDS instance address. SSL enforced end-to-end via `sslmode=require` (NLB does NOT terminate TLS — PostgreSQL uses STARTTLS which is incompatible with NLB TLS listeners).
* **SSM Parameters:**
  * `/banyan/hasura/rds-nlb-endpoint` — NLB DNS name
* **Security:** NLB SG allows TCP 5432 from 0.0.0.0/0; password auth + SSL.

### 2.4 Bastion Host (SSM Tunnel)

* **Purpose:** SSM port-forwarding tunnel to reach RDS and Doltgres in private/isolated subnets.
* **Instance:** `t4g.nano` (ARM64, Amazon Linux 2023).
* **Placement:** Private subnet (`banyan-prod-private-1a`).
* **Security Group:** `banyan-prod-bastion-sg` — no inbound rules, all outbound (SSM via NAT + RDS).
* **IAM:** Instance profile with `AmazonSSMManagedInstanceCore` managed policy.
* **Access:** No SSH — access exclusively via AWS SSM Session Manager.
* **Tunnel commands:**
  * `AWS_PROFILE=banyan bun run hasura:tunnel` (forwards `localhost:15432` to RDS port `5432`)
  * `AWS_PROFILE=banyan bun run doltgres:tunnel` (forwards `localhost:25432` to `doltgres.ddn.internal:5432`)

### 2.4 Database Layer (Amazon RDS)

* **Engine:** Amazon RDS for PostgreSQL 17.
* **Instance Class:** `db.t4g.medium` (ARM/Graviton).
* **Deployment:** Single-AZ.
* **Storage:** 50 GB `gp3` with encryption enabled (AWS-managed KMS key).
* **Parameter Group:** Custom `banyan-prod-db-param-group` (family `postgres17`) with logical replication enabled:
  * `rds.logical_replication = 1`
  * `max_replication_slots = 5`
  * `max_wal_senders = 5`
  * `rds.force_ssl = 0` — disabled so internal VPC connections (Doltgres) can connect without SSL
* **SSL Strategy:** RDS does not force SSL globally. Public connections (DDN Cloud via NLB) enforce SSL via `sslmode=require` in the connection string. Internal connections (Doltgres replication) use `sslmode=disable` for lower overhead.
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

ECS Cluster `banyan-prod-cluster` with Container Insights enabled. CloudWatch log groups with 30-day retention: `/ecs/banyan-prod/auth`, `/ecs/banyan-prod/forensics`.

#### Doltgres Logical Replica

* **Image:** `dolthub/doltgresql:latest`
* **Resources:** 1024 CPU / 2048 MB memory (x86_64 only — Doltgres image is amd64).
* **Desired Count:** 1 task.
* **Placement:** Private Subnet (`private-1a`).
* **Port:** Container port `5432`.
* **Cloud Map:** Registered as `doltgres.ddn.internal`.
* **Storage:** Amazon EFS (Elastic File System) — persistent, encrypted, `generalPurpose` performance mode, `elastic` throughput. Mount targets in both private subnets. Access point at `/doltgres-data` (UID/GID 0). EFS mounted at `/data/doltgres` (not `/var/lib/doltgres`) to avoid conflict with Docker VOLUME declaration. Config `data_dir: "/data/doltgres"` directs all database writes to EFS. Data survives task restarts and redeployments.
* **IAM:** Task role has `elasticfilesystem:ClientMount`, `ClientWrite`, `ClientRootAccess` on the EFS filesystem. Transit encryption enabled with IAM authorization.
* **Deployment:** `minimumHealthyPercent: 0`, `maximumPercent: 100`, AZ rebalancing disabled — stops old task before starting new to avoid EFS lock conflicts (Doltgres holds exclusive file locks).
* **Volumes:** 2 volumes — `doltgres-data` (EFS, `/data/doltgres`), `doltgres-config` (ephemeral, `/var/lib/doltgres` for config.yaml).
* **Init Container** (`busybox`): Writes `config.yaml` (with `user`, `listener`, `data_dir`, `behavior`, `postgres_replication` sections) to ephemeral shared volume at `/var/lib/doltgres/`.
* **Replication Config:**
  * Subscribes to `doltgres_pub` publication on RDS (slot_name = publication_name — Doltgres uses the same name for both)
  * Replicator password must be alphanumeric (no special chars) — Doltgres embeds it in a `postgres://` URL without encoding
  * Replicated tables live in the default `postgres` database (Doltgres replicator hardcodes self-connection to `postgres` db)
  * Config `user` section must match `DOLTGRES_PASSWORD` — needed for the replicator's self-connection
  * Connection via `doltgres_replicator` user without SSL (`sslmode=disable` — internal VPC traffic)
  * Every replicated transaction creates a Dolt commit (enables `dolt_log`, `dolt_diff`, time-travel queries)
* **Schema Init:** DDL not replicated by logical replication. Run `bun run doltgres:init-schema` to load schema + data from RDS into Doltgres `postgres` database, then recreate the replication slot at the current LSN.
* **Secrets:** Replicator credentials stored in Secrets Manager (`banyan-prod-doltgres-credentials`) with:
  * `replicator_username`, `replicator_password` — for RDS logical replication
  * `rds_connection_uri` — replicator connection to RDS
  * `connection_uri` — direct connection to Doltgres (`postgres@doltgres.ddn.internal:5432/postgres`)

#### Doltgres Access

* **Access:** Direct SQL via SSM tunnel only (`bun run doltgres:tunnel` → `localhost:25432`).
* **No DDN Cloud connector:** The Hasura NDC Postgres connector requires `row_to_json()` and `json_agg()` which Doltgres does not yet support. DDN Cloud integration will be revisited when Doltgres adds these PostgreSQL JSON functions.
* **Audit queries:** Use SQL directly against `dolt_log`, `dolt_branches`, `dolt_commit_ancestors`, `dolt_diff()` for version-control data.

### 2.7 Application Load Balancer

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

### 2.9 Document Forensics Service (ECS Fargate)

* **Image:** `<account>.dkr.ecr.ap-southeast-1.amazonaws.com/banyan-document-forensics:latest`
* **ECR Repository:** `banyan-document-forensics` (lifecycle policy: keep last 10 untagged images)
* **Resources:** 2048 CPU / 8192 MB memory (x86_64) — heavier due to PyTorch + TruFor model weights (~268 MB).
* **Desired Count:** 1 task.
* **Port:** Container port `4001`.
* **Health Check:** `/forensics/health` on port 4001 (interval 30s, unhealthy threshold 5, timeout 10s).
* **Load Balancing:** ALB listener rule `/forensics/*` (priority 200) — weighted forward to CPU + GPU target groups. See section 2.9.1.
* **Security Group:** `banyan-prod-forensics-sg` — inbound TCP 4001 from ALB SG, outbound all. No RDS access needed.
* **IAM Permissions:** SSM read for `/banyan/forensics/*`.
* **Secrets:** `GEMINI_API_KEY` loaded from SSM at startup (`/banyan/forensics/gemini-api-key`).
* **Runtime:** Python 3.10 (TruFor inference) + Bun (TypeScript HTTP server). TruFor weights baked into Docker image.
* **Deregistration Delay:** 120s (allow in-flight requests to complete).

### 2.9.1 Document Forensics GPU Service (ECS EC2, On-Demand)

GPU-accelerated forensics using a g4dn.xlarge EC2 instance (NVIDIA T4). Starts at zero cost and is toggled on/off via `scripts/forensics-gpu.sh`.

* **Image:** `<account>.dkr.ecr.ap-southeast-1.amazonaws.com/banyan-document-forensics-gpu:latest`
* **ECR Repository:** `banyan-document-forensics-gpu` (lifecycle policy: keep last 5 untagged images)
* **Instance Type:** g4dn.xlarge (4 vCPU, 16 GB RAM, 1 NVIDIA T4 GPU)
* **ECS Launch Type:** EC2 (not Fargate — GPU requires EC2 container instances)
* **Resources:** 3584 CPU / 14336 MB memory / 1 GPU — leaves headroom for ECS agent on g4dn.xlarge
* **Desired Count:** 0 tasks (default off, toggle with `scripts/forensics-gpu.sh on`)
* **Port:** Container port `4001`.
* **Health Check:** `/forensics/health` on port 4001 (interval 30s, healthy 2, unhealthy 3)
* **EC2 AMI:** ECS GPU-optimized Amazon Linux 2023 (`al2023-ami-ecs-gpu-hvm-*-x86_64`)
* **EBS:** 80 GB gp3 root volume (GPU Docker images are ~5-6 GB)
* **Auto Scaling Group:** `banyan-prod-forensics-gpu-asg` — min=0, max=1, desired=0 (scale-to-zero). Single AZ (ap-southeast-1a).
* **Capacity Provider:** `banyan-prod-forensics-gpu-cp` — managed scaling, managed termination protection, managed draining.
* **Security Groups:**
  * Host: `banyan-prod-forensics-gpu-host-sg` — egress only (ECS tasks use awsvpc with their own ENI)
  * Tasks: Reuses `banyan-prod-forensics-sg` (same inbound port 4001 from ALB)
* **EC2 Instance Role:** `banyan-prod-forensics-gpu-ec2-role` — `AmazonEC2ContainerServiceforEC2Role` + `AmazonSSMManagedInstanceCore`
* **Runtime:** NVIDIA CUDA 12.1 + Python 3.10 (CUDA PyTorch) + Bun. PYTHON_BRIDGE_TIMEOUT=300000 (first TruFor call loads model into VRAM).
* **ALB Routing:** Weighted forward action on `/forensics/*`:
  * Default (GPU off): CPU weight=100, GPU weight=0 (100% CPU)
  * When GPU is on: CPU weight=1, GPU weight=99 (~99% GPU)
  * The toggle script updates ALB weights via `aws elbv2 modify-rule`
* **Toggle Script:** `AWS_PROFILE=banyan bash scripts/forensics-gpu.sh [on|off|status]`
* **Cost:** $0/mo when off. ~$0.63/hr when on (~$100/mo at 8 hrs/day × 20 days).

### 2.10 Frontend Hosting (CloudFront + S3)

* **S3 Bucket:** `banyan-prod-frontend` — private, OAC access only.
* **CloudFront Distribution:** `d2y563mglh62j8.cloudfront.net` (E1SZ4G9NL7U0ZA)
  * S3 origin (default): Static assets via OAC.
  * ALB origin (`/auth/*`): HTTP origin, CachingDisabled + AllViewer policies.
  * SPA routing: 403/404 → `/index.html`.
  * PriceClass_200, HTTP/2+3, CloudFront default certificate.

### 2.11 S3 Metadata Bucket

* **Bucket:** `banyan-hasura-metadata` (created manually, not managed by Pulumi).
* **Purpose:** Stores the Hasura OpenDD metadata files that the engine loads at startup.
* **Files:**
  * `open_dd.json` — OpenDD supergraph metadata (DataConnectorLink, Models, ObjectTypes, Relationships, Permissions, ScalarTypes, etc.).
  * `metadata.json` — NDC connector introspection metadata.
* **Deployment Flow:** The `hasura:deploy` script uploads these files to S3, then triggers ECS service restarts. The engine init container downloads them from S3 at task startup.
* **Access:** ECS task role has `s3:GetObject` permission scoped to `arn:aws:s3:::banyan-hasura-metadata/*`.

### 2.12 JWT Authentication

* **HMAC Key:** Random 32-byte key generated via `@pulumi/random` `RandomBytes`, base64-encoded.
* **Secret Storage:** Secrets Manager (`banyan-prod-jwt-secret`) stores `{ "key": "<base64>" }`.
* **Admin Token:** A pre-signed JWT (HS256, 100-year expiry) with `x-hasura-default-role: admin` is generated at deploy time using `jose` and stored in SSM at `/banyan/hasura/admin-token`.
* **Engine Integration:** The init container receives the HMAC key via ECS secret injection and replaces the `__JWT_SECRET_KEY__` placeholder in `auth_config.json` using `sed`.

---

## 3. IAM Roles

* **Execution Role (`banyan-prod-ecs-exec-role`):** ECS agent. Permissions: ECR pulls, CloudWatch logs, Secrets Manager read (DB, JWT, Doltgres secrets).
* **Task Role (`banyan-prod-ecs-task-role`):** Running containers. Permissions: SES, SNS, SSM (auth service).
* **Doltgres EFS Policy (`banyan-prod-doltgres-efs-policy`):** Attached to task role — allows EFS mount, write, and root access for Doltgres persistent storage.
* **GPU EC2 Instance Role (`banyan-prod-forensics-gpu-ec2-role`):** EC2 container instance. Permissions: `AmazonEC2ContainerServiceforEC2Role` (ECS agent), `AmazonSSMManagedInstanceCore` (SSM debugging).

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
| `domainName` | yes | — | Domain for the ALB |
| `doltgresCpu` | no | `1024` | Doltgres task CPU units |
| `doltgresMemory` | no | `2048` | Doltgres task memory (MB) |
| `doltgresDataVolumeSize` | no | `50` | (unused — EFS is elastic, no fixed size) |

### 4.4 Stack Outputs

* `VpcId`: VPC ID
* `AlbDnsName`: Public ALB DNS name (auth service)
* `NlbDnsName`: NLB DNS name (DDN Cloud → RDS)
* `RdsEndpoint`: RDS private endpoint
* `SecretArn`: Secrets Manager ARN for DB credentials
* `BastionInstanceId`: EC2 instance ID for SSM tunnel
* `DoltgresServiceArn`: ARN of the Doltgres ECS service
* `DoltgresEfsId`: EFS file system ID for Doltgres persistent storage
* `DomainName`: Domain name
* `CertificateArn`: ACM certificate ARN
* `CertValidationCname`: DNS CNAME records for cert validation
* `AuthEcrRepoUrl`: ECR repository URL for the auth service
* `ForensicsEcrRepoUrl`: ECR repository URL for the document forensics service
* `ForensicsGpuEcrRepoUrl`: ECR repository URL for the GPU forensics service

---

## 5. File Structure

```
rootstock/
├── index.ts                     # Entry point, stack outputs
├── config.ts                    # Centralized pulumi.Config
├── Pulumi.yaml                  # S3 backend config
├── Pulumi.prod.yaml             # Stack config values
├── CLAUDE.md                    # Agent instructions
├── overview.md                  # This file — infrastructure overview
├── providers/
│   └── aws.ts                   # AWS provider (profile: banyan)
├── lib/
│   ├── types.ts                 # TypeScript interfaces
│   ├── tags.ts                  # Standard tags (Project: banyan-ddn)
│   └── utils.ts                 # getRegion, getEnv, logResource
└── resources/
    ├── index.ts                 # Re-exports all resource modules
    ├── vpc.ts                   # VPC, IGW, NAT, subnets, route tables
    ├── security-groups.ts       # NLB SG, ALB SG, RDS SG, Doltgres SG
    ├── bastion.ts               # SSM bastion (t4g.nano, IAM, SG)
    ├── rds.ts                   # Random password, Secrets Manager, RDS instance, parameter group
    ├── ecs-cluster.ts           # ECS cluster
    ├── ecs-iam.ts               # Execution role, task role, policies
    ├── cloud-map.ts             # Cloud Map DNS namespace (ddn.internal) — Doltgres services
    ├── acm.ts                   # ACM certificate + DNS validation
    ├── jwt.ts                   # JWT HMAC key, Secrets Manager, admin token, SSM
    ├── alb.ts                   # ALB, HTTP redirect, HTTPS listener (404 default)
    ├── auth-secrets.ts          # OAuth SSM parameters
    ├── ecs-auth.ts              # Auth service task def + ECS service
    ├── ecs-forensics.ts         # Document forensics ECR + task def + ECS service (CPU Fargate)
    ├── ecs-forensics-gpu.ts     # GPU forensics: EC2 g4dn.xlarge, ASG, capacity provider, weighted ALB rule
    ├── nlb-rds-proxy.ts         # NLB, target group, listener, SSM param
    ├── github-oidc.ts           # GitHub Actions OIDC provider and deploy role
    └── doltgres.ts              # Doltgres Fargate + EFS + SG + Secrets + Cloud Map + NLB integration
```

---

## 6. Cost Estimate (~$310/month baseline)

| Component | Monthly | % of Total |
|-----------|---------|-----------|
| Forensics Fargate (1 task: 2048 CPU / 8192 MB, x86_64) | $85.00 | 28% |
| RDS PostgreSQL 17 (db.t4g.medium + 50GB gp3) | $81.36 | 26% |
| NAT Gateway (1 NAT + ~10GB data) | $43.66 | 14% |
| Doltgres Fargate (1 task: 1024 CPU / 2048 MB, x86_64) | $37.18 | 12% |
| ALB (hourly + ~1 LCU) | $24.24 | 8% |
| NLB (RDS proxy for DDN Cloud) | $20.00 | 6% |
| Doltgres EFS (elastic, ~10 GB est.) | $3.00 | 1% |
| Bastion (t4g.nano, on-demand) | $3.07 | 1% |
| ACM Certificate | $0.00 | 0% |
| Other (Secrets Manager, Cloud Map, CloudWatch, ECR, SSM) | $5.50 | <2% |
| **Total (always-on)** | **~$305/mo** | |

**GPU Forensics (on-demand, not included above):**

| State | Cost |
|-------|------|
| GPU OFF (default) | $0/mo (ASG 0 instances) |
| GPU ON, on-demand | ~$0.63/hr |
| GPU ON, 8 hrs/day × 20 days | ~$100/mo |
| ECR storage (~5 GB GPU image) | ~$0.50/mo |

**Cost optimization paths:** RDS Reserved Instance (~30-40% savings), Fargate Savings Plans (~20%), reduce to 1 task per service (~50% Fargate savings).
