import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanDnsNamespace } from "./cloud-map.ts";
import { banyanDoltgresSecret, banyanDoltgresSg } from "./doltgres.ts";
import { banyanCluster, banyanNdcDoltgresLogGroup } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// NDC Doltgres Security Group
// ============================================================

const banyanNdcDoltgresSg = new aws.ec2.SecurityGroup("banyan-prod-ndc-doltgres-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-ndc-doltgres-sg",
  description: "Security group for NDC Postgres Connector (Doltgres)",
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
    Name: "banyan-prod-ndc-doltgres-sg",
    Component: "security-group",
    Service: "ndc-doltgres",
  }),
});

// Allow NDC Doltgres → Doltgres on port 5432
new aws.vpc.SecurityGroupIngressRule("banyan-prod-doltgres-from-ndc", {
  securityGroupId: banyanDoltgresSg.id,
  referencedSecurityGroupId: banyanNdcDoltgresSg.id,
  fromPort: 5432,
  toPort: 5432,
  ipProtocol: "tcp",
  description: "PostgreSQL from NDC Doltgres connector",
  tags: mergeTags({ Name: "doltgres-from-ndc", Component: "security-group" }),
});

// ============================================================
// Cloud Map Service (NDC Doltgres Connector)
// ============================================================

const banyanNdcDoltgresServiceDiscovery = new aws.servicediscovery.Service("banyan-prod-ndc-doltgres-service-discovery", {
  name: "ndc-doltgres",
  dnsConfig: {
    namespaceId: banyanDnsNamespace.id,
    dnsRecords: [{ ttl: 10, type: "A" }],
    routingPolicy: "MULTIVALUE",
  },
  healthCheckCustomConfig: { failureThreshold: 1 },
  tags: mergeTags({
    Name: "ndc-doltgres.ddn.internal",
    Component: "cloud-map",
    Service: "ndc-doltgres",
  }),
});

// ============================================================
// NDC Doltgres Connector Task Definition
// ============================================================

const ndcDoltgresConfigJson = JSON.stringify({
  version: "5",
  connectionSettings: {
    connectionUri: { variable: "CONNECTION_URI" },
  },
});

export const banyanNdcDoltgresTaskDef = new aws.ecs.TaskDefinition("banyan-prod-ndc-doltgres-task-def", {
  family: "banyan-prod-ndc-doltgres",
  cpu: "256",
  memory: "512",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: banyanExecRole.arn,
  taskRoleArn: banyanTaskRole.arn,
  volumes: [{ name: "connector-config" }],
  containerDefinitions: pulumi.all([banyanDoltgresSecret.arn, banyanNdcDoltgresLogGroup.name]).apply(([secretArn, logGroupName]) =>
    JSON.stringify([
      {
        name: "init-ndc-config",
        image: "public.ecr.aws/docker/library/busybox:latest",
        essential: false,
        command: ["sh", "-c", `echo '${ndcDoltgresConfigJson}' > /etc/connector/configuration.json`],
        mountPoints: [{ sourceVolume: "connector-config", containerPath: "/etc/connector" }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "ndc-doltgres-init",
          },
        },
      },
      {
        name: "init-ndc-introspect",
        image: "ghcr.io/hasura/ndc-postgres:v3.0.0",
        essential: false,
        dependsOn: [{ containerName: "init-ndc-config", condition: "SUCCESS" }],
        entryPoint: ["/bin/ndc-postgres-cli"],
        command: ["update"],
        environment: [
          { name: "HASURA_PLUGIN_CONNECTOR_CONTEXT_PATH", value: "/etc/connector" },
        ],
        secrets: [
          {
            name: "CONNECTION_URI",
            valueFrom: `${secretArn}:connection_uri::`,
          },
        ],
        mountPoints: [{ sourceVolume: "connector-config", containerPath: "/etc/connector" }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "ndc-doltgres-introspect",
          },
        },
      },
      {
        name: "ndc-postgres",
        image: "ghcr.io/hasura/ndc-postgres:v3.0.0",
        essential: true,
        dependsOn: [{ containerName: "init-ndc-introspect", condition: "SUCCESS" }],
        portMappings: [{ containerPort: 8080, protocol: "tcp" }],
        mountPoints: [{ sourceVolume: "connector-config", containerPath: "/etc/connector" }],
        secrets: [
          {
            name: "CONNECTION_URI",
            valueFrom: `${secretArn}:connection_uri::`,
          },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "ndc-doltgres",
          },
        },
      },
    ]),
  ),
  tags: mergeTags({
    Name: "banyan-prod-ndc-doltgres-task-def",
    Component: "ecs",
    Service: "ndc-doltgres",
  }),
});

// ============================================================
// NDC Doltgres Connector ECS Service
// ============================================================

export const banyanNdcDoltgresService = new aws.ecs.Service("banyan-prod-ndc-doltgres-service", {
  name: "banyan-prod-ndc-doltgres-service",
  cluster: banyanCluster.arn,
  taskDefinition: banyanNdcDoltgresTaskDef.arn,
  desiredCount: 1,
  launchType: "FARGATE",
  networkConfiguration: {
    subnets: banyanPrivateSubnets.map((s) => s.id),
    securityGroups: [banyanNdcDoltgresSg.id],
    assignPublicIp: false,
  },
  serviceRegistries: {
    registryArn: banyanNdcDoltgresServiceDiscovery.arn,
  },
  tags: mergeTags({
    Name: "banyan-prod-ndc-doltgres-service",
    Component: "ecs",
    Service: "ndc-doltgres",
  }),
});
