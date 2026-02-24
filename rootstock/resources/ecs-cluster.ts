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

export const banyanEngineLogGroup = new aws.cloudwatch.LogGroup("banyan-prod-engine-logs", {
  name: "/ecs/banyan-prod/engine",
  retentionInDays: 30,
  tags: mergeTags({
    Name: "banyan-prod-engine-logs",
    Component: "logs",
    Service: "engine",
  }),
});

export const banyanNdcLogGroup = new aws.cloudwatch.LogGroup("banyan-prod-ndc-logs", {
  name: "/ecs/banyan-prod/ndc",
  retentionInDays: 30,
  tags: mergeTags({
    Name: "banyan-prod-ndc-logs",
    Component: "logs",
    Service: "ndc-connector",
  }),
});
