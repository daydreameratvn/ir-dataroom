/**
 * Banyan Pulumi Entry Point
 *
 * Hasura DDN v3 Self-Hosted Infrastructure on AWS
 *
 * Components: VPC, RDS PostgreSQL, ECS Fargate (Engine + NDC Connector),
 * ALB, Cloud Map, Secrets Manager
 */

// ============================================================
// Providers
// ============================================================
import { awsProvider } from "./providers/aws.ts";

// ============================================================
// Configuration
// ============================================================
import { awsConfig, environment, stackName } from "./config.ts";

// ============================================================
// Resources
// ============================================================
import * as resources from "./resources/index.ts";

// ============================================================
// Stack Outputs
// ============================================================
export const stackOutputs = {
  stackName,
  environment,
  awsRegion: awsConfig.region,

  VpcId: resources.banyanVpc.id,
  AlbDnsName: resources.banyanAlb.dnsName,
  RdsEndpoint: resources.banyanDb.endpoint,
  SecretArn: resources.banyanDbSecret.arn,
};
