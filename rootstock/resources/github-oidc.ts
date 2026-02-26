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
                  "repo:papaya-insurtech/banyan:*",
              },
            },
          },
        ],
      }),
    ),
    // SSM read access for /banyan/hasura/* parameters
    inlinePolicies: [
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
    ],
    tags: mergeTags({
      Name: "banyan-github-actions-deploy",
      Component: "iam",
    }),
  },
);
