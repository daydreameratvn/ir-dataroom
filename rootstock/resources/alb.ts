import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";
import { banyanCertValidation } from "./acm.ts";
import { banyanAlbSg } from "./security-groups.ts";
import { banyanPublicSubnets, banyanVpc } from "./vpc.ts";

// ============================================================
// Application Load Balancer
// ============================================================

export const banyanAlb = new aws.lb.LoadBalancer("banyan-prod-alb", {
  name: "banyan-prod-alb",
  internal: false,
  loadBalancerType: "application",
  securityGroups: [banyanAlbSg.id],
  subnets: banyanPublicSubnets.map((s) => s.id),
  tags: mergeTags({ Name: "banyan-prod-alb", Component: "alb" }),
});

// ============================================================
// Target Group (Engine port 3000)
// ============================================================

export const banyanEngineTg = new aws.lb.TargetGroup("banyan-prod-engine-tg", {
  name: "banyan-prod-engine-tg",
  port: 3000,
  protocol: "HTTP",
  targetType: "ip",
  vpcId: banyanVpc.id,
  healthCheck: {
    enabled: true,
    path: "/health",
    port: "3000",
    protocol: "HTTP",
    healthyThreshold: 2,
    unhealthyThreshold: 3,
    timeout: 5,
    interval: 15,
    matcher: "200-299",
  },
  tags: mergeTags({ Name: "banyan-prod-engine-tg", Component: "alb" }),
});

// ============================================================
// HTTP Listener (port 80) — redirect to HTTPS
// ============================================================

const banyanAlbListenerHttp = new aws.lb.Listener("banyan-prod-alb-listener-http", {
  loadBalancerArn: banyanAlb.arn,
  port: 80,
  protocol: "HTTP",
  defaultActions: [
    {
      type: "redirect",
      redirect: {
        port: "443",
        protocol: "HTTPS",
        statusCode: "HTTP_301",
      },
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-alb-listener-http",
    Component: "alb",
  }),
});

// ============================================================
// HTTPS Listener (port 443) — TLS 1.3
// ============================================================

export const banyanAlbListener = new aws.lb.Listener("banyan-prod-alb-listener-https", {
  loadBalancerArn: banyanAlb.arn,
  port: 443,
  protocol: "HTTPS",
  sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06",
  certificateArn: banyanCertValidation.certificateArn,
  defaultActions: [
    {
      type: "forward",
      targetGroupArn: banyanEngineTg.arn,
    },
  ],
  tags: mergeTags({
    Name: "banyan-prod-alb-listener-https",
    Component: "alb",
  }),
});
