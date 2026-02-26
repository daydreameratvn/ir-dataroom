import * as aws from "@pulumi/aws";
import { ddnCloudConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";
import { banyanVpc } from "./vpc.ts";

// ============================================================
// ALB Security Group
// ============================================================

export const banyanAlbSg = new aws.ec2.SecurityGroup("banyan-prod-alb-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-alb-sg",
  description: "Security group for the public ALB",
  ingress: [
    {
      description: "HTTP from anywhere",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      description: "HTTPS from anywhere",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
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
  tags: mergeTags({ Name: "banyan-prod-alb-sg", Component: "security-group" }),
});

// ============================================================
// RDS Security Group
// ============================================================

export const banyanRdsSg = new aws.ec2.SecurityGroup("banyan-prod-rds-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-rds-sg",
  description: "Security group for RDS PostgreSQL",
  ingress: [
    {
      description: "PostgreSQL from DDN Cloud via NLB",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      cidrBlocks: ddnCloudConfig.egressCidrs,
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
  tags: mergeTags({ Name: "banyan-prod-rds-sg", Component: "security-group" }),
});
