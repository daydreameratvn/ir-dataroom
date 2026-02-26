
# Project Requirements: Banyan AWS Infrastructure via Pulumi

## 1. Project Overview

**Objective:** Manage the AWS infrastructure supporting Papaya's Banyan platform — database, auth service, networking, and DDN Cloud connectivity.
**Region:** `ap-southeast-1` (Singapore)
**Target Environment:** 1 Production Environment (`prod`).
**IaC Tool:** Pulumi (TypeScript) with an S3 backend for state management.
**AWS Profile:** `banyan` — all AWS operations use this named profile.

### Architecture

The Hasura GraphQL layer runs on **DDN Cloud** (Hasura's managed service). This infrastructure provides:

1. **RDS PostgreSQL 16** — the database, in isolated subnets
2. **NLB (Network Load Balancer)** — internet-facing TCP proxy allowing DDN Cloud connectors to reach RDS
3. **ALB (Application Load Balancer)** — public-facing HTTPS for the auth service
4. **ECS Fargate** — runs the auth API service
5. **Bastion** — SSM tunnel for database access (migrations, debugging)
6. **Secrets** — JWT key, DB credentials, OAuth secrets

---

## 2. Infrastructure Architecture & Scope

### 2.1 Networking & VPC

Multi-AZ network foundation spanning 2 Availability Zones (`ap-southeast-1a`, `ap-southeast-1b`).

* **VPC:** CIDR `10.68.0.0/16` with DNS support and DNS hostnames enabled.
* **Subnet Tiers:**

| Subnet | CIDR | AZ | Type | Purpose |
|--------|------|----|------|---------|
| banyan-prod-public-1a | 10.68.0.0/24 | 1a | Public | ALB, NLB, NAT Gateway |
| banyan-prod-public-1b | 10.68.1.0/24 | 1b | Public | ALB, NLB |
| banyan-prod-private-1a | 10.68.10.0/24 | 1a | Private | ECS Fargate (auth) |
| banyan-prod-private-1b | 10.68.11.0/24 | 1b | Private | ECS Fargate (auth) |
| banyan-prod-isolated-1a | 10.68.20.0/24 | 1a | Isolated | RDS |
| banyan-prod-isolated-1b | 10.68.21.0/24 | 1b | Isolated | RDS |

* **NAT Gateway:** Single NAT Gateway in `public-1a` (cost optimization).
* **Internet Gateway:** Attached to VPC for public subnet internet access.
* **Isolated Subnets:** No internet route whatsoever — RDS only.

### 2.2 Security Groups

| SG | Inbound Rule | Source |
|----|-------------|--------|
| `banyan-prod-alb-sg` | TCP 80, 443 | 0.0.0.0/0 |
| `banyan-prod-rds-sg` | TCP 5432 | DDN Cloud egress CIDRs, Bastion SG, Auth SG |
| `banyan-prod-bastion-sg` | (none — SSM only) | — |
| `banyan-prod-auth-sg` | TCP 4000 | ALB SG |
| `banyan-prod-nlb-sg` | TCP 5432 | 0.0.0.0/0 |

All security groups allow all outbound traffic.

### 2.3 NLB RDS Proxy (DDN Cloud Connectivity)

* **Purpose:** Allow DDN Cloud connectors to reach RDS PostgreSQL in isolated subnets.
* **Type:** Network Load Balancer, internet-facing, TCP only.
* **Placement:** Public subnets.
* **Target Group:** IP type, port 5432, pointing at RDS instance address.
* **Listener:** TCP port 5432, forwarding to target group.
* **SSM Parameter:** NLB DNS name stored at `/banyan/hasura/rds-nlb-endpoint`.
* **Security:** NLB SG allows TCP 5432; RDS SG allows DDN Cloud egress CIDRs.

### 2.4 Bastion Host (SSM Tunnel)

* **Purpose:** SSM port-forwarding tunnel to reach RDS in isolated subnets.
* **Instance:** `t4g.nano` (ARM64, Amazon Linux 2023).
* **Placement:** Private subnet (`banyan-prod-private-1a`).
* **Security Group:** `banyan-prod-bastion-sg` — no inbound rules, all outbound.
* **IAM:** Instance profile with `AmazonSSMManagedInstanceCore` managed policy.
* **Access:** No SSH — access exclusively via AWS SSM Session Manager.
* **Tunnel command:** `AWS_PROFILE=banyan bun run hasura:tunnel` (forwards `localhost:15432` to RDS port `5432`).

### 2.5 Database Layer (Amazon RDS)

* **Engine:** Amazon RDS for PostgreSQL 16.
* **Instance Class:** `db.t4g.medium` (ARM/Graviton).
* **Deployment:** Single-AZ.
* **Storage:** 50 GB `gp3` with encryption enabled (AWS-managed KMS key).
* **Backup:** 7-day retention, deletion protection enabled.
* **Credentials:** Random 32-character password. Connection details stored in **AWS Secrets Manager**.

### 2.6 Compute Layer (Amazon ECS Fargate)

ECS Cluster `banyan-prod-cluster` with Container Insights enabled.

#### Auth API Service

* **Image:** `auth-service:latest` (ECR)
* **Resources:** 256 CPU / 512 MB memory
* **Desired Count:** 2 tasks (multi-AZ)
* **Port:** 4000 (exposed via ALB at `/auth/*`)
* **Secrets:** DATABASE_URL, JWT_SECRET_KEY
* **IAM:** SES (email), SNS (SMS), SSM (parameter read for OAuth credentials)

### 2.7 Application Load Balancer

* **Type:** Public-facing, application load balancer in public subnets.
* **Domain:** `prod.banyan.services.papaya.asia`
* **HTTP Listener (port 80):** 301 redirect to HTTPS.
* **HTTPS Listener (port 443):** TLS 1.3, ACM certificate. Default action returns 404.
* **Path Rule:** `/auth/*` → auth service target group.

### 2.8 ACM Certificate

* **Domain:** `prod.banyan.services.papaya.asia` + SAN wildcard.
* **Validation:** DNS.

### 2.9 JWT Authentication

* **HMAC Key:** Random 32-byte key, base64-encoded, in Secrets Manager.
* **Admin Token:** Pre-signed JWT (HS256, 100-year expiry) stored in SSM at `/banyan/hasura/admin-token`.
* **Shared with DDN Cloud:** The same JWT key is set as a DDN Cloud secret.

---

## 3. IAM Roles

* **Execution Role (`banyan-prod-ecs-exec-role`):** ECS agent. Permissions: ECR pulls, CloudWatch logs, Secrets Manager read.
* **Task Role (`banyan-prod-ecs-task-role`):** Running containers. Permissions: SES, SNS, SSM (auth service).

---

## 4. Pulumi Configuration & State

### 4.1 Backend Configuration

* **S3 Backend:** `s3://banyan-pulumi-state-bucket?region=ap-southeast-1`
* **Project Name:** `banyan-ddn`
* **Stack:** `prod`
* **Passphrase:** Stored in SSM at `/banyan/pulumi/config-passphrase`.

### 4.2 Pulumi Config Keys

| Key | Required | Default | Description |
|-----|----------|---------|-------------|
| `awsRegion` | yes | — | AWS region (`ap-southeast-1`) |
| `environment` | no | `prod` | Environment name |
| `vpcCidr` | no | `10.50.0.0/16` | VPC CIDR block |
| `dbInstanceClass` | no | `db.t4g.medium` | RDS instance class |
| `dbAllocatedStorage` | no | `50` | RDS storage in GB |
| `dbName` | no | `banyan` | PostgreSQL database name |
| `domainName` | yes | — | Domain for the ALB |
| `ddnCloudEgressCidrs` | no | `[]` | DDN Cloud egress CIDRs for RDS SG |

### 4.3 Stack Outputs

* `VpcId`: VPC ID
* `AlbDnsName`: Public ALB DNS name (auth service)
* `NlbDnsName`: NLB DNS name (DDN Cloud → RDS)
* `RdsEndpoint`: RDS private endpoint
* `SecretArn`: Secrets Manager ARN for DB credentials
* `BastionInstanceId`: EC2 instance ID for SSM tunnel
* `DomainName`: Domain name
* `CertificateArn`: ACM certificate ARN
* `CertValidationCname`: DNS CNAME records for cert validation

---

## 5. File Structure

```
rootstock/
├── index.ts                     # Entry point, stack outputs
├── config.ts                    # Centralized pulumi.Config
├── Pulumi.yaml                  # S3 backend config
├── Pulumi.prod.yaml             # Stack config values
├── CLAUDE.md                    # Agent instructions
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
    ├── security-groups.ts       # ALB SG, RDS SG
    ├── bastion.ts               # SSM bastion (t4g.nano, IAM, SG)
    ├── rds.ts                   # Random password, Secrets Manager, RDS instance
    ├── ecs-cluster.ts           # ECS cluster
    ├── ecs-iam.ts               # Execution role, task role, policies
    ├── acm.ts                   # ACM certificate + DNS validation
    ├── jwt.ts                   # JWT HMAC key, Secrets Manager, admin token, SSM
    ├── alb.ts                   # ALB, HTTP redirect, HTTPS listener (404 default)
    ├── auth-secrets.ts          # OAuth SSM parameters
    ├── ecs-auth.ts              # Auth service task def + ECS service
    └── nlb-rds-proxy.ts         # NLB, target group, listener, SSM param
```

---

## 6. Cost Estimate (~$175/month)

| Component | Monthly | % of Total |
|-----------|---------|-----------|
| RDS PostgreSQL (db.t4g.medium + 50GB gp3) | $81.36 | 47% |
| NAT Gateway (1 NAT + ~10GB data) | $43.66 | 25% |
| ALB (hourly + ~1 LCU) | $24.24 | 14% |
| NLB (RDS proxy for DDN Cloud) | $20.00 | 11% |
| Bastion (t4g.nano, on-demand) | $3.07 | 2% |
| ACM Certificate | $0.00 | 0% |
| Other (Secrets Manager, CloudWatch, SSM) | $1.50 | <1% |
| **Total** | **~$175/mo** | |

**Savings vs. self-hosted:** ~$46/month (removed ECS Fargate for engine + NDC, Cloud Map, S3 metadata).

**DDN Cloud cost:** Depends on plan and active model count (separate from AWS bill).
