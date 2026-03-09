import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// GitHub Actions OIDC Provider
// ============================================================

export const githubOidcProvider = new aws.iam.OpenIdConnectProvider(
  "github-actions-oidc",
  {
    url: "https://token.actions.githubusercontent.com",
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: [
      "6938fd4d98bab03faadb97b34396831e3780aea1",
      "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
    ],
    tags: mergeTags({
      Name: "github-actions-oidc",
      Component: "iam",
    }),
  },
);

// ============================================================
// GitHub Actions Deploy Role (OIDC)
// ============================================================

export const githubActionsDeployRole = new aws.iam.Role(
  "banyan-github-actions-deploy",
  {
    name: "banyan-github-actions-deploy",
    description: "GitHub Actions deploy role for banyan repo (OIDC)",
    assumeRolePolicy: githubOidcProvider.arn.apply((arn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Federated: arn },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              },
              StringLike: {
                "token.actions.githubusercontent.com:sub":
                  "repo:papaya-insurtech/banyan:ref:refs/heads/main",
              },
            },
          },
        ],
      }),
    ),
    inlinePolicies: [
      // SSM read access for /banyan/hasura/* parameters (DDN deploy)
      {
        name: "ssm-hasura-read",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["ssm:GetParameter", "ssm:GetParameters"],
              Resource:
                "arn:aws:ssm:ap-southeast-1:812652266901:parameter/banyan/hasura/*",
            },
          ],
        }),
      },
      // ECR: push Docker images (auth, forensics)
      {
        name: "ecr-push",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "ecr:GetAuthorizationToken",
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: [
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:PutImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
              ],
              Resource: [
                "arn:aws:ecr:ap-southeast-1:812652266901:repository/banyan-auth",
                "arn:aws:ecr:ap-southeast-1:812652266901:repository/banyan-document-forensics",
                "arn:aws:ecr:ap-southeast-1:812652266901:repository/banyan-document-forensics-gpu",
              ],
            },
          ],
        }),
      },
      // ECS: force new deployments and wait for stability
      {
        name: "ecs-deploy",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "ecs:UpdateService",
                "ecs:DescribeServices",
                "ecs:DescribeTaskDefinition",
              ],
              Resource: "*",
              Condition: {
                StringEquals: { "ecs:cluster": "arn:aws:ecs:ap-southeast-1:812652266901:cluster/banyan-prod-cluster" },
              },
            },
            {
              Effect: "Allow",
              Action: "ecs:DescribeServices",
              Resource: "*",
            },
          ],
        }),
      },
      // S3: sync frontend assets
      {
        name: "s3-frontend-deploy",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              Resource: [
                "arn:aws:s3:::banyan-prod-frontend",
                "arn:aws:s3:::banyan-prod-frontend/*",
                "arn:aws:s3:::banyan-prod-investor-portal",
                "arn:aws:s3:::banyan-prod-investor-portal/*",
                "arn:aws:s3:::banyan-prod-phoenix",
                "arn:aws:s3:::banyan-prod-phoenix/*",
              ],
            },
          ],
        }),
      },
      // CloudFront: invalidate caches after deploy
      {
        name: "cloudfront-invalidate",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "cloudfront:CreateInvalidation",
                "cloudfront:ListDistributions",
              ],
              Resource: "*",
            },
          ],
        }),
      },
      // STS: get-caller-identity (used by deploy.sh for account ID)
      {
        name: "sts-identity",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "sts:GetCallerIdentity",
              Resource: "*",
            },
          ],
        }),
      },
      // S3: read ML weights for forensics deploy
      {
        name: "s3-ml-weights-read",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:ListBucket"],
              Resource: [
                "arn:aws:s3:::banyan-ml-weights",
                "arn:aws:s3:::banyan-ml-weights/*",
              ],
            },
          ],
        }),
      },
    ],
    tags: mergeTags({
      Name: "banyan-github-actions-deploy",
      Component: "iam",
    }),
  },
);
