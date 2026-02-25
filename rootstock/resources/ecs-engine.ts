import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { ecsConfig, hasuraConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";
import { banyanAlbListener, banyanEngineTg } from "./alb.ts";
import { banyanCluster, banyanEngineLogGroup } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanJwtSecret } from "./jwt.ts";
import { banyanEngineSg } from "./security-groups.ts";
import { banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// Engine Task Definition
// ============================================================

const authConfigJson = JSON.stringify({
  version: "v2",
  definition: {
    mode: {
      jwt: {
        claimsConfig: {
          namespace: {
            claimsFormat: "Json",
            location: "/https:~1~1hasura.io~1jwt~1claims",
          },
        },
        key: { fixed: { algorithm: "HS256", key: { value: "__JWT_SECRET_KEY__" } } },
        tokenLocation: { type: "BearerAuthorization" },
      },
    },
  },
});

const metadataBucket = hasuraConfig.metadataBucket;

export const banyanEngineTaskDef = new aws.ecs.TaskDefinition("banyan-prod-engine-task-def", {
  family: "banyan-prod-v3-engine",
  cpu: String(ecsConfig.engineCpu),
  memory: String(ecsConfig.engineMemory),
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: banyanExecRole.arn,
  taskRoleArn: banyanTaskRole.arn,
  volumes: [{ name: "engine-metadata" }],
  containerDefinitions: pulumi
    .all([banyanEngineLogGroup.name, banyanJwtSecret.arn])
    .apply(([logGroupName, jwtSecretArn]) =>
    JSON.stringify([
      {
        name: "init-engine-metadata",
        image: "public.ecr.aws/aws-cli/aws-cli:latest",
        essential: false,
        entryPoint: ["sh", "-c"],
        command: [
          [
            "mkdir -p /md",
            `echo '${authConfigJson}' > /md/auth_config.json`,
            `sed -i "s|__JWT_SECRET_KEY__|$JWT_SECRET_KEY|" /md/auth_config.json`,
            `aws s3 cp s3://${metadataBucket}/open_dd.json /md/open_dd.json`,
            `aws s3 cp s3://${metadataBucket}/metadata.json /md/metadata.json`,
          ].join(" && "),
        ],
        secrets: [
          {
            name: "JWT_SECRET_KEY",
            valueFrom: `${jwtSecretArn}:key::`,
          },
        ],
        mountPoints: [{ sourceVolume: "engine-metadata", containerPath: "/md" }],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "engine-init",
          },
        },
      },
      {
        name: "v3-engine",
        image: "ghcr.io/hasura/v3-engine:latest",
        essential: true,
        dependsOn: [{ containerName: "init-engine-metadata", condition: "SUCCESS" }],
        portMappings: [{ containerPort: 3000, protocol: "tcp" }],
        command: [
          "--metadata-path",
          "/md/open_dd.json",
          "--authn-config-path",
          "/md/auth_config.json",
          "--otlp-endpoint",
          "http://0.0.0.0:4318",
          "--port",
          "3000",
        ],
        mountPoints: [{ sourceVolume: "engine-metadata", containerPath: "/md" }],
        environment: [
          {
            name: "ENABLE_CORS",
            value: "true",
          },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": "ap-southeast-1",
            "awslogs-stream-prefix": "engine",
          },
        },
      },
    ]),
  ),
  tags: mergeTags({
    Name: "banyan-prod-engine-task-def",
    Component: "ecs",
    Service: "engine",
  }),
});

// ============================================================
// Engine ECS Service
// ============================================================

export const banyanEngineService = new aws.ecs.Service(
  "banyan-prod-engine-service",
  {
    name: "banyan-prod-engine-service",
    cluster: banyanCluster.arn,
    taskDefinition: banyanEngineTaskDef.arn,
    desiredCount: 2,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: banyanPrivateSubnets.map((s) => s.id),
      securityGroups: [banyanEngineSg.id],
      assignPublicIp: false,
    },
    loadBalancers: [
      {
        targetGroupArn: banyanEngineTg.arn,
        containerName: "v3-engine",
        containerPort: 3000,
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-engine-service",
      Component: "ecs",
      Service: "engine",
    }),
  },
  { dependsOn: [banyanAlbListener] },
);
