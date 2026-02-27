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

// No special chars — Doltgres embeds this in a postgres:// URL without encoding
const doltgresReplicatorPassword = new random.RandomPassword("banyan-prod-doltgres-replicator-password-v2", {
  length: 48,
  special: false,
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
      // sslmode=disable — internal VPC connection, no SSL needed (rds.force_ssl=0)
      rds_connection_uri: `postgresql://doltgres_replicator:${encodeURIComponent(password)}@${rdsAddress}:5432/banyan?sslmode=disable`,
      doltgres_host: "doltgres.ddn.internal",
      doltgres_port: 5432,
      // Doltgres replicator hardcodes self-connection to "postgres" db, so all replicated tables live there
      connection_uri: `postgresql://postgres:${encodeURIComponent(rootPassword)}@doltgres.ddn.internal:5432/postgres`,
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
// EFS — Persistent Storage for Doltgres
// ============================================================

const banyanDoltgresEfsSg = new aws.ec2.SecurityGroup("banyan-prod-doltgres-efs-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-doltgres-efs-sg",
  description: "Security group for Doltgres EFS mount targets",
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
    Name: "banyan-prod-doltgres-efs-sg",
    Component: "security-group",
    Service: "doltgres",
  }),
});

// Allow Doltgres Fargate tasks → EFS on port 2049 (NFS)
new aws.vpc.SecurityGroupIngressRule("banyan-prod-efs-from-doltgres", {
  securityGroupId: banyanDoltgresEfsSg.id,
  referencedSecurityGroupId: banyanDoltgresSg.id,
  fromPort: 2049,
  toPort: 2049,
  ipProtocol: "tcp",
  description: "NFS from Doltgres Fargate tasks",
  tags: mergeTags({ Name: "efs-from-doltgres", Component: "security-group" }),
});

export const banyanDoltgresEfs = new aws.efs.FileSystem("banyan-prod-doltgres-efs", {
  encrypted: true,
  performanceMode: "generalPurpose",
  throughputMode: "elastic",
  tags: mergeTags({
    Name: "banyan-prod-doltgres-efs",
    Component: "efs",
    Service: "doltgres",
  }),
});

// Mount targets in each private subnet (Fargate tasks run here)
for (let i = 0; i < banyanPrivateSubnets.length; i++) {
  const azSuffix = ["1a", "1b"][i];
  new aws.efs.MountTarget(`banyan-prod-doltgres-efs-mt-${azSuffix}`, {
    fileSystemId: banyanDoltgresEfs.id,
    subnetId: banyanPrivateSubnets[i]!.id,
    securityGroups: [banyanDoltgresEfsSg.id],
  });
}

const banyanDoltgresEfsAp = new aws.efs.AccessPoint("banyan-prod-doltgres-efs-ap", {
  fileSystemId: banyanDoltgresEfs.id,
  rootDirectory: {
    path: "/doltgres-data",
    creationInfo: {
      ownerGid: 0,
      ownerUid: 0,
      permissions: "0755",
    },
  },
  posixUser: {
    gid: 0,
    uid: 0,
  },
  tags: mergeTags({
    Name: "banyan-prod-doltgres-efs-ap",
    Component: "efs",
    Service: "doltgres",
  }),
});

// Grant task role access to EFS
const banyanDoltgresEfsPolicy = new aws.iam.Policy("banyan-prod-doltgres-efs-policy", {
  name: "banyan-prod-doltgres-efs-policy",
  description: "Allow Doltgres ECS tasks to mount and write to EFS",
  policy: banyanDoltgresEfs.arn.apply((arn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "elasticfilesystem:ClientMount",
            "elasticfilesystem:ClientWrite",
            "elasticfilesystem:ClientRootAccess",
          ],
          Resource: [arn],
        },
      ],
    }),
  ),
  tags: mergeTags({
    Name: "banyan-prod-doltgres-efs-policy",
    Component: "iam",
    Service: "doltgres",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-doltgres-efs-attachment", {
  role: banyanTaskRole.name,
  policyArn: banyanDoltgresEfsPolicy.arn,
});

// ============================================================
// Doltgres Task Definition
// ============================================================

// Doltgres config.yaml for replication — written by init container
// data_dir: /data/doltgres — EFS mount, avoids Docker VOLUME conflict at /var/lib/doltgres
const doltgresConfigYaml = pulumi.all([banyanDb.address, doltgresReplicatorPassword.result, doltgresRootPassword.result]).apply(([rdsAddress, password, rootPassword]) => `
listener:
  host: "0.0.0.0"
  port: 5432

data_dir: "/data/doltgres"

user:
  name: "postgres"
  password: "${rootPassword}"

behavior:
  read_only: false
  dolt_transaction_commit: true

postgres_replication:
  postgres_server_address: "${rdsAddress}"
  postgres_user: "doltgres_replicator"
  postgres_password: "${password}"
  postgres_database: "banyan"
  postgres_port: 5432
  slot_name: "doltgres_pub"
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
  volumes: [
    {
      name: "doltgres-data",
      efsVolumeConfiguration: {
        fileSystemId: banyanDoltgresEfs.id,
        transitEncryption: "ENABLED",
        authorizationConfig: {
          accessPointId: banyanDoltgresEfsAp.id,
          iam: "ENABLED",
        },
      },
    },
    { name: "doltgres-config" }, // ephemeral shared volume for /var/lib/doltgres/ (config.yaml)
  ],
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
            // Ensure EFS data directory exists
            "mkdir -p /data/doltgres",
            // Write config.yaml to ephemeral shared volume (subshell so heredoc terminator is isolated from && chain)
            `(cat > /var/lib/doltgres/config.yaml << 'DOLTCFG'\n${configYaml}\nDOLTCFG\n)`,
          ].join(" && "),
        ],
        mountPoints: [
          { sourceVolume: "doltgres-data", containerPath: "/data/doltgres" },
          { sourceVolume: "doltgres-config", containerPath: "/var/lib/doltgres" },
        ],
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
        mountPoints: [
          { sourceVolume: "doltgres-data", containerPath: "/data/doltgres" },
          { sourceVolume: "doltgres-config", containerPath: "/var/lib/doltgres" },
        ],
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
// Doltgres ECS Service (Fargate + EFS Persistent Volume)
// ============================================================

// ============================================================
// Doltgres ECS Service (Fargate + EFS Persistent Volume)
// ============================================================

export const banyanDoltgresService = new aws.ecs.Service("banyan-prod-doltgres-service", {
  name: "banyan-prod-doltgres-service",
  cluster: banyanCluster.arn,
  taskDefinition: banyanDoltgresTaskDef.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  platformVersion: "1.4.0",
  // Stop old task before starting new — Doltgres holds exclusive EFS lock
  availabilityZoneRebalancing: "DISABLED",
  deploymentMinimumHealthyPercent: 0,
  deploymentMaximumPercent: 100,
  networkConfiguration: {
    subnets: [banyanPrivateSubnets[0]!.id],
    securityGroups: [banyanDoltgresSg.id],
    assignPublicIp: false,
  },
  serviceRegistries: {
    registryArn: banyanDoltgresServiceDiscovery.arn,
  },
  tags: mergeTags({
    Name: "banyan-prod-doltgres-service",
    Component: "ecs",
    Service: "doltgres",
  }),
});
