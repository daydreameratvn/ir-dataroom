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
// Engine Security Group
// ============================================================

export const banyanEngineSg = new aws.ec2.SecurityGroup("banyan-prod-engine-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-engine-sg",
  description: "Security group for Hasura v3 Engine",
  ingress: [
    {
      description: "Engine port from ALB",
      fromPort: 3000,
      toPort: 3000,
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
    Name: "banyan-prod-engine-sg",
    Component: "security-group",
  }),
});

// ============================================================
// NDC Connector Security Group
// ============================================================

export const banyanNdcSg = new aws.ec2.SecurityGroup("banyan-prod-ndc-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-ndc-sg",
  description: "Security group for NDC Postgres Connector",
  ingress: [
    {
      description: "NDC port from Engine",
      fromPort: 8080,
      toPort: 8080,
      protocol: "tcp",
      securityGroups: [banyanEngineSg.id],
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
  tags: mergeTags({ Name: "banyan-prod-ndc-sg", Component: "security-group" }),
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
      description: "PostgreSQL from NDC Connector",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroups: [banyanNdcSg.id],
    },
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
