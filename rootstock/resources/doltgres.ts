import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { doltgresConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";
import { banyanBastionSg } from "./bastion.ts";
import { banyanDnsNamespace } from "./cloud-map.ts";
import { banyanCluster, banyanDoltgresLogGroup } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanDb } from "./rds.ts";
import { banyanRdsSg } from "./security-groups.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// Doltgres Replicator Password
// ============================================================

const doltgresReplicatorPassword = new random.RandomPassword("banyan-prod-doltgres-replicator-password", {
  length: 32,
  special: true,
  overrideSpecial: "!#$%&*()-_=+[]{}|:?",
});

const doltgresRootPassword = new random.RandomPassword("banyan-prod-doltgres-root-password", {
  length: 32,
  special: false,
});

// ============================================================
// Secrets Manager — Doltgres Credentials
// ============================================================

export const banyanDoltgresSecret = new aws.secretsmanager.Secret("banyan-prod-doltgres-secret", {
  name: "banyan-prod-doltgres-credentials",
  description: "Doltgres replicator credentials and connection URI",
  tags: mergeTags({
    Name: "banyan-prod-doltgres-secret",
    Component: "secrets-manager",
    Service: "doltgres",
  }),
});

new aws.secretsmanager.SecretVersion("banyan-prod-doltgres-secret-version", {
  secretId: banyanDoltgresSecret.id,
  secretString: pulumi.all([doltgresReplicatorPassword.result, doltgresRootPassword.result, banyanDb.address]).apply(([password, rootPassword, rdsAddress]) =>
    JSON.stringify({
      replicator_username: "doltgres_replicator",
      replicator_password: password,
      root_password: rootPassword,
      rds_host: rdsAddress,
      rds_port: 5432,
      rds_connection_uri: `postgresql://doltgres_replicator:${encodeURIComponent(password)}@${rdsAddress}:5432/banyan`,
      doltgres_host: "doltgres.ddn.internal",
      doltgres_port: 5432,
      connection_uri: `postgresql://postgres:${encodeURIComponent(rootPassword)}@doltgres.ddn.internal:5432/banyan`,
    }),
  ),
});

// ============================================================
// Grant Execution Role access to Doltgres secret
// ============================================================

const banyanExecDoltgresSecretsPolicy = new aws.iam.Policy("banyan-prod-ecs-exec-doltgres-secrets-policy", {
  name: "banyan-prod-ecs-exec-doltgres-secrets-policy",
  description: "Allow ECS tasks to read Doltgres credentials from Secrets Manager",
  policy: banyanDoltgresSecret.arn.apply((arn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
          Resource: [arn],
        },
      ],
    }),
  ),
  tags: mergeTags({
    Name: "banyan-prod-ecs-exec-doltgres-secrets-policy",
    Component: "iam",
    Service: "doltgres",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-ecs-exec-doltgres-secrets-attachment", {
  role: banyanExecRole.name,
  policyArn: banyanExecDoltgresSecretsPolicy.arn,
});

// ============================================================
// Security Group — Doltgres
// ============================================================

export const banyanDoltgresSg = new aws.ec2.SecurityGroup("banyan-prod-doltgres-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-doltgres-sg",
  description: "Security group for Doltgres logical replica",
  egress: [
    {
      description: "Allow all outbound",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-doltgres-sg",
    Component: "security-group",
    Service: "doltgres",
  }),
});

// Allow Doltgres → RDS on port 5432 (for logical replication)
new aws.vpc.SecurityGroupIngressRule("banyan-prod-rds-from-doltgres", {
  securityGroupId: banyanRdsSg.id,
  referencedSecurityGroupId: banyanDoltgresSg.id,
  fromPort: 5432,
  toPort: 5432,
  ipProtocol: "tcp",
  description: "PostgreSQL from Doltgres (logical replication)",
  tags: mergeTags({ Name: "rds-from-doltgres", Component: "security-group" }),
});

// Allow Bastion → Doltgres on port 5432 (for tunnel access)
new aws.vpc.SecurityGroupIngressRule("banyan-prod-doltgres-from-bastion", {
  securityGroupId: banyanDoltgresSg.id,
  referencedSecurityGroupId: banyanBastionSg.id,
  fromPort: 5432,
  toPort: 5432,
  ipProtocol: "tcp",
  description: "PostgreSQL from Bastion (SSM tunnel)",
  tags: mergeTags({ Name: "doltgres-from-bastion", Component: "security-group" }),
});

// ============================================================
// Cloud Map Service (Doltgres)
// ============================================================

const banyanDoltgresServiceDiscovery = new aws.servicediscovery.Service("banyan-prod-doltgres-service-discovery", {
  name: "doltgres",
  dnsConfig: {
    namespaceId: banyanDnsNamespace.id,
    dnsRecords: [{ ttl: 10, type: "A" }],
    routingPolicy: "MULTIVALUE",
  },
  healthCheckCustomConfig: { failureThreshold: 1 },
  tags: mergeTags({
    Name: "doltgres.ddn.internal",
    Component: "cloud-map",
    Service: "doltgres",
  }),
});

// ============================================================
// IAM Role — EBS Volume Management (Fargate EBS)
// ============================================================

const banyanDoltgresEbsRole = new aws.iam.Role("banyan-prod-doltgres-ebs-role", {
  name: "banyan-prod-doltgres-ebs-role",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: mergeTags({
    Name: "banyan-prod-doltgres-ebs-role",
    Component: "iam",
    Service: "doltgres",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-doltgres-ebs-policy", {
  role: banyanDoltgresEbsRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRolePolicyForVolumes",
});

// ============================================================
// Doltgres Task Definition
// ============================================================

// Doltgres config.yaml for replication — written by init container
const doltgresConfigYaml = pulumi.all([banyanDb.address, doltgresReplicatorPassword.result]).apply(([rdsAddress, password]) => `
listener:
  host: "0.0.0.0"
  port: 5432

behavior:
  read_only: false
  dolt_transaction_commit: true

postgres_replication:
  postgres_server_address: "${rdsAddress}"
  postgres_user: "doltgres_replicator"
  postgres_password: "${password}"
  postgres_database: "banyan"
  postgres_port: 5432
  slot_name: "doltgres_slot"
`.trim());

export const banyanDoltgresTaskDef = new aws.ecs.TaskDefinition("banyan-prod-doltgres-task-def", {
  family: "banyan-prod-doltgres",
  cpu: String(doltgresConfig.cpu),
  memory: String(doltgresConfig.memory),
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: banyanExecRole.arn,
  taskRoleArn: banyanTaskRole.arn,
  runtimePlatform: {
    cpuArchitecture: "X86_64",
    operatingSystemFamily: "LINUX",
  },
  volumes: [{ name: "doltgres-data", configureAtLaunch: true }],
  containerDefinitions: pulumi.all([banyanDoltgresLogGroup.name, doltgresConfigYaml, doltgresRootPassword.result]).apply(([logGroupName, configYaml, rootPassword]) =>
    JSON.stringify([
      {
        name: "init-doltgres-config",
        image: "public.ecr.aws/docker/library/busybox:latest",
        essential: false,
        command: [
          "sh",
          "-c",
          [
            // Initialize doltgres data directory
            "mkdir -p /var/lib/doltgres",
            // Write config.yaml
            `cat > /var/lib/doltgres/config.yaml << 'DOLTCFG'\n${configYaml}\nDOLTCFG`,
          ].join(" && "),
        ],
        mountPoints: [{ sourceVolume: "doltgres-data", containerPath: "/var/lib/doltgres" }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "doltgres-init",
          },
        },
      },
      {
        name: "doltgresql",
        image: "dolthub/doltgresql:latest",
        essential: true,
        dependsOn: [{ containerName: "init-doltgres-config", condition: "SUCCESS" }],
        portMappings: [{ containerPort: 5432, protocol: "tcp" }],
        mountPoints: [{ sourceVolume: "doltgres-data", containerPath: "/var/lib/doltgres" }],
        environment: [
          { name: "DOLTGRES_PASSWORD", value: rootPassword },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "doltgres",
          },
        },
      },
    ]),
  ),
  tags: mergeTags({
    Name: "banyan-prod-doltgres-task-def",
    Component: "ecs",
    Service: "doltgres",
  }),
});

// ============================================================
// Doltgres ECS Service (Fargate + Managed EBS Volume)
// ============================================================

export const banyanDoltgresService = new aws.ecs.Service("banyan-prod-doltgres-service", {
  name: "banyan-prod-doltgres-service",
  cluster: banyanCluster.arn,
  taskDefinition: banyanDoltgresTaskDef.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  networkConfiguration: {
    subnets: [banyanPrivateSubnets[0]!.id],
    securityGroups: [banyanDoltgresSg.id],
    assignPublicIp: false,
  },
  serviceRegistries: {
    registryArn: banyanDoltgresServiceDiscovery.arn,
  },
  volumeConfiguration: {
    name: "doltgres-data",
    managedEbsVolume: {
      roleArn: banyanDoltgresEbsRole.arn,
      sizeInGb: doltgresConfig.dataVolumeSize,
      volumeType: "gp3",
      encrypted: true,
      fileSystemType: "ext4",
    },
  },
  tags: mergeTags({
    Name: "banyan-prod-doltgres-service",
    Component: "ecs",
    Service: "doltgres",
  }),
});
