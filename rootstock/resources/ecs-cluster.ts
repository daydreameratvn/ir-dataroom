import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// ECS Cluster
// ============================================================

export const banyanCluster = new aws.ecs.Cluster("banyan-prod-cluster", {
  name: "banyan-prod-cluster",
  settings: [{ name: "containerInsights", value: "enabled" }],
  tags: mergeTags({ Name: "banyan-prod-cluster", Component: "ecs" }),
});

// ============================================================
// CloudWatch Log Groups
// ============================================================

export const banyanDoltgresLogGroup = new aws.cloudwatch.LogGroup("banyan-prod-doltgres-logs", {
  name: "/ecs/banyan-prod/doltgres",
  retentionInDays: 30,
  tags: mergeTags({
    Name: "banyan-prod-doltgres-logs",
    Component: "logs",
    Service: "doltgres",
  }),
});

export const banyanNdcDoltgresLogGroup = new aws.cloudwatch.LogGroup("banyan-prod-ndc-doltgres-logs", {
  name: "/ecs/banyan-prod/ndc-doltgres",
  retentionInDays: 30,
  tags: mergeTags({
    Name: "banyan-prod-ndc-doltgres-logs",
    Component: "logs",
    Service: "ndc-doltgres",
  }),
});
