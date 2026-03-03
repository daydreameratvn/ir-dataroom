import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanCluster } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanAlbSg } from "./security-groups.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// ECR Repository — Document Forensics Service
// ============================================================

export const banyanForensicsEcrRepo = new aws.ecr.Repository("banyan-document-forensics", {
  name: "banyan-document-forensics",
  imageScanningConfiguration: { scanOnPush: true },
  imageTagMutability: "MUTABLE",
  forceDelete: false,
  tags: mergeTags({
    Name: "banyan-document-forensics",
    Component: "ecr",
    Service: "forensics",
  }),
});

new aws.ecr.LifecyclePolicy("banyan-document-forensics-lifecycle", {
  repository: banyanForensicsEcrRepo.name,
  policy: JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: "Expire untagged images after 10",
        selection: {
          tagStatus: "untagged",
          countType: "imageCountMoreThan",
          countNumber: 10,
        },
        action: { type: "expire" },
      },
    ],
  }),
});

// ============================================================
// Forensics Service Security Group
// ============================================================

export const banyanForensicsSg = new aws.ec2.SecurityGroup("banyan-prod-forensics-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-forensics-sg",
  description: "Security group for Document Forensics service",
  ingress: [
    {
      description: "Forensics port from ALB",
      fromPort: 4001,
      toPort: 4001,
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
    Name: "banyan-prod-forensics-sg",
    Component: "security-group",
    Service: "forensics",
  }),
});

// ============================================================
// CloudWatch Log Group
// ============================================================

export const banyanForensicsLogGroup = new aws.cloudwatch.LogGroup("banyan-prod-forensics-logs", {
  name: "/ecs/banyan-prod/forensics",
  retentionInDays: 30,
  tags: mergeTags({
    Name: "banyan-prod-forensics-logs",
    Component: "logs",
    Service: "forensics",
  }),
});

// ============================================================
// Forensics Target Group
// ============================================================

export const banyanForensicsTg = new aws.lb.TargetGroup("banyan-prod-forensics-tg", {
  name: "banyan-prod-forensics-tg",
  port: 4001,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: banyanVpc.id,
  deregistrationDelay: 120,
  healthCheck: {
    enabled: true,
    path: "/forensics/health",
    port: "4001",
    protocol: "HTTP",
    healthyThreshold: 2,
    unhealthyThreshold: 5,
    timeout: 10,
    interval: 30,
    matcher: "200-299",
  },
  tags: mergeTags({
    Name: "banyan-prod-forensics-tg",
    Component: "alb",
    Service: "forensics",
  }),
});

// NOTE: ALB Listener Rule for /forensics/* is defined in ecs-forensics-gpu.ts
// as a weighted forward rule targeting both CPU (this TG) and GPU target groups.

// ============================================================
// Forensics IAM — SSM read for secrets
// ============================================================

const banyanForensicsTaskPolicy = new aws.iam.Policy("banyan-prod-forensics-task-policy", {
  name: "banyan-prod-forensics-task-policy",
  description: "Allow forensics service to read SSM params for secrets",
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["ssm:GetParameter"],
        Resource: "arn:aws:ssm:ap-southeast-1:*:parameter/banyan/forensics/*",
      },
    ],
  }),
  tags: mergeTags({
    Name: "banyan-prod-forensics-task-policy",
    Component: "iam",
    Service: "forensics",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-forensics-task-policy-attachment", {
  role: banyanTaskRole.name,
  policyArn: banyanForensicsTaskPolicy.arn,
});

// ============================================================
// Forensics Task Definition
// ============================================================

export const banyanForensicsTaskDef = new aws.ecs.TaskDefinition(
  "banyan-prod-forensics-task-def",
  {
    family: "banyan-prod-forensics",
    cpu: "2048",
    memory: "8192",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    runtimePlatform: {
      cpuArchitecture: "X86_64",
      operatingSystemFamily: "LINUX",
    },
    executionRoleArn: banyanExecRole.arn,
    taskRoleArn: banyanTaskRole.arn,
    containerDefinitions: pulumi
      .all([banyanForensicsLogGroup.name, banyanForensicsEcrRepo.repositoryUrl])
      .apply(([logGroupName, ecrUrl]) =>
        JSON.stringify([
          {
            name: "forensics",
            image: `${ecrUrl}:latest`,
            essential: true,
            portMappings: [{ containerPort: 4001, protocol: "tcp" }],
            environment: [
              { name: "PORT", value: "4001" },
              { name: "NODE_ENV", value: "production" },
              { name: "AWS_REGION", value: "ap-southeast-1" },
              { name: "PYTHON_BRIDGE_TIMEOUT", value: "300000" },
            ],
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": logGroupName,
                "awslogs-region": "ap-southeast-1",
                "awslogs-stream-prefix": "forensics",
              },
            },
          },
        ]),
      ),
    tags: mergeTags({
      Name: "banyan-prod-forensics-task-def",
      Component: "ecs",
      Service: "forensics",
    }),
  },
);

// ============================================================
// Forensics ECS Service
// ============================================================

export const banyanForensicsService = new aws.ecs.Service(
  "banyan-prod-forensics-service",
  {
    name: "banyan-prod-forensics-service",
    cluster: banyanCluster.arn,
    taskDefinition: banyanForensicsTaskDef.arn,
    desiredCount: 1,
    launchType: "FARGATE",
    networkConfiguration: {
      subnets: banyanPrivateSubnets.map((s) => s.id),
      securityGroups: [banyanForensicsSg.id],
      assignPublicIp: false,
    },
    loadBalancers: [
      {
        targetGroupArn: banyanForensicsTg.arn,
        containerName: "forensics",
        containerPort: 4001,
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-forensics-service",
      Component: "ecs",
      Service: "forensics",
    }),
  },
);
