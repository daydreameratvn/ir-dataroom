import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanJwtSecret } from "./jwt.ts";
import { banyanDbSecret } from "./rds.ts";

// ============================================================
// ECS Task Execution Role
// ============================================================

export const banyanExecRole = new aws.iam.Role("banyan-prod-ecs-exec-role", {
  name: "banyan-prod-ecs-exec-role",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: mergeTags({
    Name: "banyan-prod-ecs-exec-role",
    Component: "iam",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-ecs-exec-policy", {
  role: banyanExecRole.name,
  policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
});

const banyanExecSecretsPolicy = new aws.iam.Policy("banyan-prod-ecs-exec-secrets-policy", {
  name: "banyan-prod-ecs-exec-secrets-policy",
  description: "Allow ECS tasks to read DB and JWT secrets from Secrets Manager",
  policy: pulumi.all([banyanDbSecret.arn, banyanJwtSecret.arn]).apply(([dbArn, jwtArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
          Resource: [dbArn, jwtArn],
        },
      ],
    }),
  ),
  tags: mergeTags({
    Name: "banyan-prod-ecs-exec-secrets-policy",
    Component: "iam",
  }),
});

new aws.iam.RolePolicyAttachment("banyan-prod-ecs-exec-secrets-attachment", {
  role: banyanExecRole.name,
  policyArn: banyanExecSecretsPolicy.arn,
});

// ============================================================
// ECS Task Role
// ============================================================

export const banyanTaskRole = new aws.iam.Role("banyan-prod-ecs-task-role", {
  name: "banyan-prod-ecs-task-role",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ecs-tasks.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
  tags: mergeTags({
    Name: "banyan-prod-ecs-task-role",
    Component: "iam",
  }),
});
