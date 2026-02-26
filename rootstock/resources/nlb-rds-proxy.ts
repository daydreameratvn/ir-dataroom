import * as aws from "@pulumi/aws";
import dns from "node:dns/promises";
import { mergeTags } from "../lib/tags.ts";
import { banyanDb } from "./rds.ts";
import { banyanPublicSubnets, banyanVpc } from "./vpc.ts";

// ============================================================
// NLB Security Group
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
// Network Load Balancer (internet-facing, TCP only)
// ============================================================

export const banyanNlb = new aws.lb.LoadBalancer("banyan-prod-nlb-rds", {
  name: "banyan-prod-nlb-rds",
  internal: false,
  loadBalancerType: "network",
  securityGroups: [banyanNlbSg.id],
  subnets: banyanPublicSubnets.map((s) => s.id),
  tags: mergeTags({
    Name: "banyan-prod-nlb-rds",
    Component: "nlb",
    Service: "rds-proxy",
  }),
});

// ============================================================
// Target Group (IP type, pointing at RDS instance)
// ============================================================

export const banyanNlbTargetGroup = new aws.lb.TargetGroup("banyan-prod-nlb-rds-tg", {
  name: "banyan-prod-nlb-rds-tg",
  port: 5432,
  protocol: "TCP",
  targetType: "ip",
  vpcId: banyanVpc.id,
  healthCheck: {
    enabled: true,
    protocol: "TCP",
    port: "5432",
    healthyThreshold: 3,
    unhealthyThreshold: 3,
    interval: 30,
  },
  tags: mergeTags({
    Name: "banyan-prod-nlb-rds-tg",
    Component: "nlb",
    Service: "rds-proxy",
  }),
});

// ============================================================
// Target Group Attachment (RDS instance IP)
// NLB IP target groups require an IPv4 address, not a hostname.
// Resolve the RDS DNS name to its private IP at deploy time.
// ============================================================

const rdsIp = banyanDb.address.apply(async (hostname) => {
  const result = await dns.lookup(hostname, { family: 4 });
  return result.address;
});

export const banyanNlbTargetAttachment = new aws.lb.TargetGroupAttachment("banyan-prod-nlb-rds-target", {
  targetGroupArn: banyanNlbTargetGroup.arn,
  targetId: rdsIp,
  port: 5432,
});

// ============================================================
// TCP Listener (port 5432)
// ============================================================

export const banyanNlbListener = new aws.lb.Listener("banyan-prod-nlb-rds-listener", {
  loadBalancerArn: banyanNlb.arn,
  port: 5432,
  protocol: "TCP",
  defaultActions: [
    {
      type: "forward",
      targetGroupArn: banyanNlbTargetGroup.arn,
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-nlb-rds-listener",
    Component: "nlb",
    Service: "rds-proxy",
  }),
});

// ============================================================
// SSM Parameter — NLB DNS endpoint for DDN Cloud connector
// ============================================================

export const banyanNlbEndpointParam = new aws.ssm.Parameter("banyan-prod-nlb-rds-endpoint", {
  name: "/banyan/hasura/rds-nlb-endpoint",
  type: "String",
  value: banyanNlb.dnsName,
  description: "NLB DNS name for DDN Cloud to reach RDS PostgreSQL",
  tags: mergeTags({
    Name: "banyan-prod-nlb-rds-endpoint",
    Component: "ssm",
    Service: "rds-proxy",
  }),
});

// ============================================================
// SSM Parameter — DDN Cloud GraphQL endpoint for consumers
// ============================================================

export const banyanDdnEndpointParam = new aws.ssm.Parameter("banyan-prod-ddn-endpoint", {
  name: "/banyan/hasura/ddn-cloud-endpoint",
  type: "String",
  value: "https://banyan-prod.ddn.hasura.app/graphql",
  description: "DDN Cloud GraphQL API endpoint for agents and frontend",
  tags: mergeTags({
    Name: "banyan-prod-ddn-endpoint",
    Component: "ssm",
    Service: "ddn-cloud",
  }),
});
