import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanDb } from "./rds.ts";
import { banyanNlbSg, banyanRdsSg } from "./security-groups.ts";
import { banyanPublicSubnets, banyanVpc } from "./vpc.ts";

// ============================================================
// Network Load Balancer (internet-facing, TCP pass-through)
//
// SSL architecture: NLB uses TCP (not TLS) because PostgreSQL clients
// use STARTTLS (SSLRequest), which is incompatible with NLB TLS termination
// (NLB TLS expects a raw TLS ClientHello as the first message).
// Instead, SSL is enforced end-to-end via sslmode=require in the connection
// string — PostgreSQL SSL passes through the NLB transparently.
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
// Look up the RDS ENI's private IP via the RDS security group
// (works from outside the VPC, unlike dns.lookup on the hostname).
// ============================================================

const rdsIp = pulumi.all([banyanRdsSg.id, banyanVpc.id]).apply(([sgId, vpcId]) => {
  return aws.ec2.getNetworkInterfaces({
    filters: [
      { name: "group-id", values: [sgId] },
      { name: "vpc-id", values: [vpcId] },
    ],
  }).then((enis) => {
    const eniId = enis.ids[0];
    if (!eniId) throw new Error(`No ENI found for RDS security group: ${sgId}`);
    return aws.ec2.getNetworkInterface({ id: eniId });
  }).then((eni) => eni.privateIp);
});

export const banyanNlbTargetAttachment = new aws.lb.TargetGroupAttachment("banyan-prod-nlb-rds-target", {
  targetGroupArn: banyanNlbTargetGroup.arn,
  targetId: rdsIp,
  port: 5432,
});

// ============================================================
// TCP Listener (port 5432)
// TCP pass-through — PostgreSQL SSL (sslmode=require) is negotiated
// end-to-end between DDN Cloud and RDS through this listener.
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
  value: "https://banyan.services.papaya.asia/graphql",
  description: "DDN Cloud GraphQL API endpoint for agents and frontend",
  tags: mergeTags({
    Name: "banyan-prod-ddn-endpoint",
    Component: "ssm",
    Service: "ddn-cloud",
  }),
});

