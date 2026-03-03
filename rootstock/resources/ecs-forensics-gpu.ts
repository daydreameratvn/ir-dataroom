import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanAlbListener } from "./alb.ts";
import { banyanCluster } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanForensicsSg, banyanForensicsTg } from "./ecs-forensics.ts";
import { banyanAlbSg } from "./security-groups.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";

// ============================================================
// GPU Forensics — On-Demand g4dn.xlarge with Scale-to-Zero
//
// Adds a GPU-backed ECS EC2 service behind the same /forensics/*
// ALB path. When GPU is on, ALB sends ~99% traffic to GPU TG.
// When GPU is off (0 healthy targets), 100% falls back to CPU.
// ============================================================

// ============================================================
// ECR Repository — GPU Forensics Image
// ============================================================

export const banyanForensicsGpuEcrRepo = new aws.ecr.Repository(
  "banyan-document-forensics-gpu",
  {
    name: "banyan-document-forensics-gpu",
    imageScanningConfiguration: { scanOnPush: true },
    imageTagMutability: "MUTABLE",
    forceDelete: false,
    tags: mergeTags({
      Name: "banyan-document-forensics-gpu",
      Component: "ecr",
      Service: "forensics-gpu",
    }),
  },
);

new aws.ecr.LifecyclePolicy("banyan-document-forensics-gpu-lifecycle", {
  repository: banyanForensicsGpuEcrRepo.name,
  policy: JSON.stringify({
    rules: [
      {
        rulePriority: 1,
        description: "Keep last 5 untagged images",
        selection: {
          tagStatus: "untagged",
          countType: "imageCountMoreThan",
          countNumber: 5,
        },
        action: { type: "expire" },
      },
    ],
  }),
});

// ============================================================
// CloudWatch Log Group — GPU Forensics
// ============================================================

export const banyanForensicsGpuLogGroup = new aws.cloudwatch.LogGroup(
  "banyan-prod-forensics-gpu-logs",
  {
    name: "/ecs/banyan-prod/forensics-gpu",
    retentionInDays: 30,
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-logs",
      Component: "logs",
      Service: "forensics-gpu",
    }),
  },
);

// ============================================================
// EC2 Instance Role + Profile (for ECS EC2 container instances)
// ============================================================

const forensicsGpuEc2Role = new aws.iam.Role("banyan-prod-forensics-gpu-ec2-role", {
  name: "banyan-prod-forensics-gpu-ec2-role",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ec2.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: mergeTags({
    Name: "banyan-prod-forensics-gpu-ec2-role",
    Component: "iam",
    Service: "forensics-gpu",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-forensics-gpu-ecs-policy", {
  role: forensicsGpuEc2Role.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
});

new aws.iam.RolePolicyAttachment("banyan-prod-forensics-gpu-ssm-policy", {
  role: forensicsGpuEc2Role.name,
  policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
});

const forensicsGpuInstanceProfile = new aws.iam.InstanceProfile(
  "banyan-prod-forensics-gpu-instance-profile",
  {
    name: "banyan-prod-forensics-gpu-instance-profile",
    role: forensicsGpuEc2Role.name,
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-instance-profile",
      Component: "iam",
      Service: "forensics-gpu",
    }),
  },
);

// ============================================================
// GPU Host Security Group
// ============================================================

const forensicsGpuHostSg = new aws.ec2.SecurityGroup("banyan-prod-forensics-gpu-host-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-forensics-gpu-host-sg",
  description: "Security group for GPU EC2 host (ECS container instance)",
  // No inbound needed — ECS tasks use awsvpc mode with their own ENI + forensics SG
  egress: [
    {
      description: "Allow all outbound (ECS agent, ECR, CloudWatch)",
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-forensics-gpu-host-sg",
    Component: "security-group",
    Service: "forensics-gpu",
  }),
});

// ============================================================
// GPU AMI Lookup — ECS GPU-optimized Amazon Linux 2023
// ============================================================

const gpuAmi = aws.ec2.getAmi({
  mostRecent: true,
  owners: ["amazon"],
  filters: [
    { name: "name", values: ["al2023-ami-ecs-gpu-hvm-*-kernel-6.1-x86_64-ebs"] },
    { name: "state", values: ["available"] },
  ],
});

// ============================================================
// Launch Template — g4dn.xlarge (NVIDIA T4)
// ============================================================

const forensicsGpuLaunchTemplate = new aws.ec2.LaunchTemplate(
  "banyan-prod-forensics-gpu-lt",
  {
    name: "banyan-prod-forensics-gpu-lt",
    imageId: pulumi.output(gpuAmi).apply((ami) => ami.id),
    instanceType: "g4dn.xlarge",
    iamInstanceProfile: {
      arn: forensicsGpuInstanceProfile.arn,
    },
    vpcSecurityGroupIds: [forensicsGpuHostSg.id],
    blockDeviceMappings: [
      {
        deviceName: "/dev/xvda",
        ebs: {
          volumeSize: 80,
          volumeType: "gp3",
          encrypted: "true",
        },
      },
    ],
    userData: pulumi
      .output(banyanCluster.name)
      .apply((clusterName) =>
        Buffer.from(
          [
            "#!/bin/bash",
            `echo "ECS_CLUSTER=${clusterName}" >> /etc/ecs/ecs.config`,
            `echo "ECS_ENABLE_GPU_SUPPORT=true" >> /etc/ecs/ecs.config`,
          ].join("\n"),
        ).toString("base64"),
      ),
    tagSpecifications: [
      {
        resourceType: "instance",
        tags: mergeTags({
          Name: "banyan-prod-forensics-gpu",
          Component: "ec2",
          Service: "forensics-gpu",
        }),
      },
      {
        resourceType: "volume",
        tags: mergeTags({
          Name: "banyan-prod-forensics-gpu-vol",
          Component: "ebs",
          Service: "forensics-gpu",
        }),
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-lt",
      Component: "ec2",
      Service: "forensics-gpu",
    }),
  },
);

// ============================================================
// Auto Scaling Group — min=0, max=1, desired=0 (scale-to-zero)
// ============================================================

const forensicsGpuAsg = new aws.autoscaling.Group("banyan-prod-forensics-gpu-asg", {
  name: "banyan-prod-forensics-gpu-asg",
  launchTemplate: {
    id: forensicsGpuLaunchTemplate.id,
    version: "$Latest",
  },
  vpcZoneIdentifiers: [banyanPrivateSubnets[0]!.id], // Single AZ: ap-southeast-1a
  minSize: 0,
  maxSize: 1,
  desiredCapacity: 0,
  protectFromScaleIn: true, // ECS managed termination protection
  tags: [
    {
      key: "Name",
      value: "banyan-prod-forensics-gpu",
      propagateAtLaunch: true,
    },
    {
      key: "ManagedBy",
      value: "pulumi",
      propagateAtLaunch: true,
    },
    {
      key: "Service",
      value: "forensics-gpu",
      propagateAtLaunch: true,
    },
  ],
});

// ============================================================
// ECS Capacity Provider — GPU
// ============================================================

const forensicsGpuCapacityProvider = new aws.ecs.CapacityProvider(
  "banyan-prod-forensics-gpu-cp",
  {
    name: "banyan-prod-forensics-gpu-cp",
    autoScalingGroupProvider: {
      autoScalingGroupArn: forensicsGpuAsg.arn,
      managedScaling: {
        status: "ENABLED",
        targetCapacity: 100,
        instanceWarmupPeriod: 300,
        minimumScalingStepSize: 1,
        maximumScalingStepSize: 1,
      },
      managedTerminationProtection: "ENABLED",
      managedDraining: "ENABLED",
    },
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-cp",
      Component: "ecs",
      Service: "forensics-gpu",
    }),
  },
);

// ============================================================
// Cluster Capacity Providers — add GPU alongside existing FARGATE
// ============================================================

export const banyanClusterCapacityProviders = new aws.ecs.ClusterCapacityProviders(
  "banyan-prod-cluster-capacity-providers",
  {
    clusterName: banyanCluster.name,
    capacityProviders: [
      "FARGATE",
      "FARGATE_SPOT",
      forensicsGpuCapacityProvider.name,
    ],
    defaultCapacityProviderStrategies: [
      {
        capacityProvider: "FARGATE",
        weight: 1,
        base: 0,
      },
    ],
  },
);

// ============================================================
// GPU Target Group
// ============================================================

export const banyanForensicsGpuTg = new aws.lb.TargetGroup(
  "banyan-prod-forensics-gpu-tg",
  {
    name: "banyan-prod-forensics-gpu-tg",
    port: 4001,
    protocol: "HTTP",
    targetType: "ip", // awsvpc on EC2 uses IP targets
    vpcId: banyanVpc.id,
    deregistrationDelay: 120,
    healthCheck: {
      enabled: true,
      path: "/forensics/health",
      port: "4001",
      protocol: "HTTP",
      healthyThreshold: 2,
      unhealthyThreshold: 3,
      timeout: 10,
      interval: 30,
      matcher: "200-299",
    },
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-tg",
      Component: "alb",
      Service: "forensics-gpu",
    }),
  },
);

// ============================================================
// ALB Listener Rule: /forensics/* → weighted forward (GPU + CPU)
//
// Defaults to 100% CPU / 0% GPU. The toggle script (forensics-gpu.sh)
// updates weights to 1% CPU / 99% GPU when GPU is turned on, and back
// to 100/0 when turned off. Weight 0 means the ALB never routes to
// GPU TG, avoiding 503s when the GPU TG has no registered targets.
//
// This replaces the simple forward rule that was in ecs-forensics.ts.
// ============================================================

export const banyanForensicsListenerRule = new aws.lb.ListenerRule(
  "banyan-prod-forensics-listener-rule",
  {
    listenerArn: banyanAlbListener.arn,
    priority: 200,
    conditions: [
      {
        pathPattern: {
          values: ["/forensics/*"],
        },
      },
    ],
    actions: [
      {
        type: "forward",
        forward: {
          targetGroups: [
            { arn: banyanForensicsTg.arn, weight: 100 },
            { arn: banyanForensicsGpuTg.arn, weight: 0 },
          ],
          stickiness: { enabled: false, duration: 1 },
        },
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-forensics-listener-rule",
      Component: "alb",
      Service: "forensics",
    }),
  },
);

// ============================================================
// GPU Task Definition (EC2 launch type)
// ============================================================

export const banyanForensicsGpuTaskDef = new aws.ecs.TaskDefinition(
  "banyan-prod-forensics-gpu-task-def",
  {
    family: "banyan-prod-forensics-gpu",
    cpu: "3584",
    memory: "14336",
    networkMode: "awsvpc",
    requiresCompatibilities: ["EC2"],
    executionRoleArn: banyanExecRole.arn,
    taskRoleArn: banyanTaskRole.arn,
    containerDefinitions: pulumi
      .all([banyanForensicsGpuLogGroup.name, banyanForensicsGpuEcrRepo.repositoryUrl])
      .apply(([logGroupName, ecrUrl]) =>
        JSON.stringify([
          {
            name: "forensics-gpu",
            image: `${ecrUrl}:latest`,
            essential: true,
            portMappings: [{ containerPort: 4001, protocol: "tcp" }],
            resourceRequirements: [{ type: "GPU", value: "1" }],
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
                "awslogs-stream-prefix": "forensics-gpu",
              },
            },
          },
        ]),
      ),
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-task-def",
      Component: "ecs",
      Service: "forensics-gpu",
    }),
  },
);

// ============================================================
// GPU ECS Service (starts with desiredCount=0)
// ============================================================

export const banyanForensicsGpuService = new aws.ecs.Service(
  "banyan-prod-forensics-gpu-service",
  {
    name: "banyan-prod-forensics-gpu-service",
    cluster: banyanCluster.arn,
    taskDefinition: banyanForensicsGpuTaskDef.arn,
    desiredCount: 0,
    capacityProviderStrategies: [
      {
        capacityProvider: forensicsGpuCapacityProvider.name,
        weight: 1,
        base: 0,
      },
    ],
    networkConfiguration: {
      subnets: [banyanPrivateSubnets[0]!.id], // Single AZ matching the ASG
      securityGroups: [banyanForensicsSg.id],
      assignPublicIp: false,
    },
    loadBalancers: [
      {
        targetGroupArn: banyanForensicsGpuTg.arn,
        containerName: "forensics-gpu",
        containerPort: 4001,
      },
    ],
    deploymentMinimumHealthyPercent: 0, // Allow desired=0 without error
    deploymentMaximumPercent: 100,
    tags: mergeTags({
      Name: "banyan-prod-forensics-gpu-service",
      Component: "ecs",
      Service: "forensics-gpu",
    }),
  },
  { dependsOn: [banyanForensicsListenerRule, banyanClusterCapacityProviders] },
);
