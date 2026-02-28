import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { domainConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";
import { banyanAlbListener } from "./alb.ts";
import { banyanCluster } from "./ecs-cluster.ts";
import { banyanAuthEcrRepo } from "./ecr.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanJwtSecret } from "./jwt.ts";
import { banyanDbSecret } from "./rds.ts";
import { banyanAlbSg, banyanRdsSg } from "./security-groups.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// Auth Service Security Group
// ============================================================

export const banyanAuthSg = new aws.ec2.SecurityGroup("banyan-prod-auth-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-auth-sg",
  description: "Security group for Auth API service",
  ingress: [
    {
      description: "Auth port from ALB",
      fromPort: 4000,
      toPort: 4000,
      protocol: "tcp",
      securityGroups: [banyanAlbSg.id],
    },
  ],
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
    Name: "banyan-prod-auth-sg",
    Component: "security-group",
    Service: "auth",
  }),
});

// Allow auth service to access RDS
const authToRdsIngress = new aws.vpc.SecurityGroupIngressRule(
  "banyan-prod-auth-to-rds",
  {
    securityGroupId: banyanRdsSg.id,
    referencedSecurityGroupId: banyanAuthSg.id,
    fromPort: 5432,
    toPort: 5432,
    ipProtocol: "tcp",
    description: "PostgreSQL from Auth service",
    tags: mergeTags({
      Name: "banyan-prod-auth-to-rds",
      Component: "security-group",
      Service: "auth",
    }),
  },
);

// ============================================================
// CloudWatch Log Group
// ============================================================

export const banyanAuthLogGroup = new aws.cloudwatch.LogGroup("banyan-prod-auth-logs", {
  name: "/ecs/banyan-prod/auth",
  retentionInDays: 30,
  tags: mergeTags({
    Name: "banyan-prod-auth-logs",
    Component: "logs",
    Service: "auth",
  }),
});

// ============================================================
// Auth Target Group
// ============================================================

export const banyanAuthTg = new aws.lb.TargetGroup("banyan-prod-auth-tg", {
  name: "banyan-prod-auth-tg",
  port: 4000,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: banyanVpc.id,
  healthCheck: {
    enabled: true,
    path: "/auth/health",
    port: "4000",
    protocol: "HTTP",
    healthyThreshold: 2,
    unhealthyThreshold: 3,
    timeout: 5,
    interval: 15,
    matcher: "200-299",
  },
  tags: mergeTags({ Name: "banyan-prod-auth-tg", Component: "alb", Service: "auth" }),
});

// ============================================================
// ALB Listener Rule: /auth/* → auth target group
// ============================================================

export const banyanAuthListenerRule = new aws.lb.ListenerRule(
  "banyan-prod-auth-listener-rule",
  {
    listenerArn: banyanAlbListener.arn,
    priority: 100,
    conditions: [
      {
        pathPattern: {
          values: ["/auth/*"],
        },
      },
    ],
    actions: [
      {
        type: "forward",
        targetGroupArn: banyanAuthTg.arn,
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-auth-listener-rule",
      Component: "alb",
      Service: "auth",
    }),
  },
);

// ============================================================
// Auth IAM — additional policies for SES and SNS
// ============================================================

const banyanAuthTaskPolicy = new aws.iam.Policy("banyan-prod-auth-task-policy", {
  name: "banyan-prod-auth-task-policy",
  description: "Allow auth service to send emails (SES) and SMS (SNS), and read SSM params",
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["ses:SendEmail", "ses:SendRawEmail"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["sns:Publish"],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: ["ssm:GetParameter"],
        Resource: `arn:aws:ssm:ap-southeast-1:*:parameter/banyan/auth/*`,
      },
      {
        Effect: "Allow",
        Action: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        Resource: "*",
      },
    ],
  }),
  tags: mergeTags({
    Name: "banyan-prod-auth-task-policy",
    Component: "iam",
    Service: "auth",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-auth-task-policy-attachment", {
  role: banyanTaskRole.name,
  policyArn: banyanAuthTaskPolicy.arn,
});

// ============================================================
// Auth Task Definition
// ============================================================

export const banyanAuthTaskDef = new aws.ecs.TaskDefinition("banyan-prod-auth-task-def", {
  family: "banyan-prod-auth",
  cpu: "256",
  memory: "512",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  executionRoleArn: banyanExecRole.arn,
  taskRoleArn: banyanTaskRole.arn,
  containerDefinitions: pulumi
    .all([banyanAuthLogGroup.name, banyanDbSecret.arn, banyanJwtSecret.arn, banyanAuthEcrRepo.repositoryUrl])
    .apply(([logGroupName, dbSecretArn, jwtSecretArn, ecrUrl]) =>
      JSON.stringify([
        {
          name: "auth",
          image: `${ecrUrl}:latest`,
          essential: true,
          portMappings: [{ containerPort: 4000, protocol: "tcp" }],
          secrets: [
            {
              name: "DATABASE_URL",
              valueFrom: `${dbSecretArn}`,
            },
            {
              name: "JWT_SECRET_KEY",
              valueFrom: `${jwtSecretArn}:key::`,
            },
          ],
          environment: [
            { name: "PORT", value: "4000" },
            { name: "NODE_ENV", value: "production" },
            { name: "AWS_REGION", value: "ap-southeast-1" },
            { name: "RP_ID", value: "papaya.asia" },
            { name: "RP_ORIGIN", value: "https://oasis.papaya.asia" },
            { name: "AUTH_BASE_URL", value: "https://oasis.papaya.asia" },
            { name: "OTP_FROM_EMAIL", value: "noreply@papaya.asia" },
            { name: "DB_SECRET_NAME", value: "banyan-prod-db-credentials" },
            { name: "JWT_SECRET_NAME", value: "banyan-prod-jwt-secret" },
          ],
          logConfiguration: {
            logDriver: "awslogs",
            options: {
              "awslogs-group": logGroupName,
              "awslogs-region": "ap-southeast-1",
              "awslogs-stream-prefix": "auth",
            },
          },
        },
      ]),
    ),
  tags: mergeTags({
    Name: "banyan-prod-auth-task-def",
    Component: "ecs",
    Service: "auth",
  }),
});

// ============================================================
// Auth ECS Service
// ============================================================

export const banyanAuthService = new aws.ecs.Service(
  "banyan-prod-auth-service",
  {
    name: "banyan-prod-auth-service",
    cluster: banyanCluster.arn,
    taskDefinition: banyanAuthTaskDef.arn,
    desiredCount: 2,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: banyanPrivateSubnets.map((s) => s.id),
      securityGroups: [banyanAuthSg.id],
      assignPublicIp: false,
    },
    loadBalancers: [
      {
        targetGroupArn: banyanAuthTg.arn,
        containerName: "auth",
        containerPort: 4000,
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-auth-service",
      Component: "ecs",
      Service: "auth",
    }),
  },
  { dependsOn: [banyanAuthListenerRule] },
);
