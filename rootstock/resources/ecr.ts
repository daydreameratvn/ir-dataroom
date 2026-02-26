import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// ECR Repository — Auth Service
// ============================================================

export const banyanAuthEcrRepo = new aws.ecr.Repository("banyan-auth", {
  name: "banyan-auth",
  imageScanningConfiguration: { scanOnPush: true },
  imageTagMutability: "MUTABLE",
  forceDelete: false,
  tags: mergeTags({
    Name: "banyan-auth",
    Component: "ecr",
    Service: "auth",
  }),
});

// Lifecycle policy: keep only the last 10 untagged images
new aws.ecr.LifecyclePolicy("banyan-auth-lifecycle", {
  repository: banyanAuthEcrRepo.name,
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
