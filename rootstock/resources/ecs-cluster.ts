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
