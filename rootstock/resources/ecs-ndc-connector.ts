import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { ecsConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";
import { banyanDnsNamespace } from "./cloud-map.ts";
import { banyanCluster, banyanNdcLogGroup } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanDbSecret } from "./rds.ts";
import { banyanNdcSg } from "./security-groups.ts";
import { banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// Cloud Map Service (NDC Connector)
// ============================================================

export const banyanNdcServiceDiscovery = new aws.servicediscovery.Service("banyan-prod-ndc-service-discovery", {
  name: "ndc-banyan-postgres",
  dnsConfig: {
    namespaceId: banyanDnsNamespace.id,
    dnsRecords: [{ ttl: 10, type: "A" }],
    routingPolicy: "MULTIVALUE",
  },
  healthCheckCustomConfig: { failureThreshold: 1 },
  tags: mergeTags({
    Name: "ndc-banyan-postgres",
    Component: "cloud-map",
    Service: "ndc-connector",
  }),
});

// ============================================================
// NDC Connector Task Definition
// ============================================================

const ndcConfigJson = JSON.stringify({
  version: "5",
  connectionSettings: {
    connectionUri: { variable: "CONNECTION_URI" },
  },
});

export const banyanNdcTaskDef = new aws.ecs.TaskDefinition("banyan-prod-ndc-task-def", {
  family: "banyan-prod-ndc-postgres",
  cpu: String(ecsConfig.ndcCpu),
  memory: String(ecsConfig.ndcMemory),
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: banyanExecRole.arn,
  taskRoleArn: banyanTaskRole.arn,
  volumes: [{ name: "connector-config" }],
  containerDefinitions: pulumi.all([banyanDbSecret.arn, banyanNdcLogGroup.name]).apply(([secretArn, logGroupName]) =>
    JSON.stringify([
      {
        name: "init-ndc-config",
        image: "public.ecr.aws/docker/library/busybox:latest",
        essential: false,
        command: ["sh", "-c", `echo '${ndcConfigJson}' > /etc/connector/configuration.json`],
        mountPoints: [{ sourceVolume: "connector-config", containerPath: "/etc/connector" }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "ndc-init",
          },
        },
      },
      {
        name: "ndc-postgres",
        image: "ghcr.io/hasura/ndc-postgres:v3.0.0",
        essential: true,
        dependsOn: [{ containerName: "init-ndc-config", condition: "SUCCESS" }],
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
            "awslogs-stream-prefix": "ndc",
          },
        },
      },
    ]),
  ),
  tags: mergeTags({
    Name: "banyan-prod-ndc-task-def",
    Component: "ecs",
    Service: "ndc-connector",
  }),
});

// ============================================================
// NDC Connector ECS Service
// ============================================================

export const banyanNdcService = new aws.ecs.Service("banyan-prod-ndc-service", {
  name: "banyan-prod-ndc-service",
  cluster: banyanCluster.arn,
  taskDefinition: banyanNdcTaskDef.arn,
  desiredCount: 2,
  launchType: "FARGATE",
  networkConfiguration: {
    subnets: banyanPrivateSubnets.map((s) => s.id),
    securityGroups: [banyanNdcSg.id],
    assignPublicIp: false,
  },
  serviceRegistries: {
    registryArn: banyanNdcServiceDiscovery.arn,
  },
  tags: mergeTags({
    Name: "banyan-prod-ndc-service",
    Component: "ecs",
    Service: "ndc-connector",
  }),
});
