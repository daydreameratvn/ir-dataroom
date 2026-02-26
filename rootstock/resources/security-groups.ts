import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";
import { banyanVpc } from "./vpc.ts";

// ============================================================
// NLB Security Group (for DDN Cloud → RDS proxy)
// ============================================================

export const banyanNlbSg = new aws.ec2.SecurityGroup("banyan-prod-nlb-sg", {
  vpcId: banyanVpc.id,
  name: "banyan-prod-nlb-sg",
  description: "Security group for NLB RDS proxy (DDN Cloud connectivity)",
  ingress: [
    {
      description: "PostgreSQL from DDN Cloud egress CIDRs",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      // DDN Cloud (public) uses dynamic egress IPs with no static CIDR ranges.
      // Must allow 0.0.0.0/0 — RDS auth (user/password + SSL) is the access control layer.
      // To restrict, upgrade to Private DDN (dedicated or BYOC) for static IPs / VPC peering.
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
  tags: mergeTags({
    Name: "banyan-prod-nlb-sg",
    Component: "security-group",
    Service: "nlb-rds-proxy",
  }),
});

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
      // Only the NLB security group can reach RDS — not the open internet.
      // The NLB itself allows 0.0.0.0/0 (DDN Cloud has no static egress IPs),
      // but this SG ensures RDS only accepts traffic forwarded through the NLB.
      description: "PostgreSQL from NLB only",
      fromPort: 5432,
      toPort: 5432,
      protocol: "tcp",
      securityGroups: [banyanNlbSg.id],
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
