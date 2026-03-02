/**
 * Banyan Pulumi Entry Point
 *
 * Infrastructure: VPC, RDS PostgreSQL, ECS Fargate (Auth service),
 * ALB, NLB (RDS proxy for DDN Cloud), Secrets Manager, Bastion
 *
 * Hasura GraphQL layer runs on DDN Cloud (managed service).
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
  NlbDnsName: resources.banyanNlb.dnsName,
  DdnCloudEndpoint: "https://banyan-prod.ddn.hasura.app/graphql",
  RdsEndpoint: resources.banyanDb.endpoint,
  SecretArn: resources.banyanDbSecret.arn,

  BastionInstanceId: resources.banyanBastion.id,
  DoltgresServiceArn: resources.banyanDoltgresService.id,
  DoltgresEfsId: resources.banyanDoltgresEfs.id,

  DomainName: resources.banyanCertificate.domainName,
  CertificateArn: resources.banyanCertificate.arn,
  CertValidationCname: resources.banyanCertificate.domainValidationOptions.apply(
    (opts) =>
      opts.map((o) => ({
        name: o.resourceRecordName,
        value: o.resourceRecordValue,
        type: o.resourceRecordType,
      })),
  ),

  // Frontend
  FrontendBucketName: resources.banyanFrontendBucket.bucket,
  CloudFrontDistributionId: resources.banyanCloudFront.id,
  CloudFrontDomainName: resources.banyanCloudFront.domainName,

  // Phoenix
  PhoenixBucketName: resources.banyanPhoenixBucket.bucket,
  PhoenixCloudFrontDistributionId: resources.banyanPhoenixCloudFront.id,
  PhoenixCloudFrontDomainName: resources.banyanPhoenixCloudFront.domainName,

  // ECR
  AuthEcrRepoUrl: resources.banyanAuthEcrRepo.repositoryUrl,
  ForensicsEcrRepoUrl: resources.banyanForensicsEcrRepo.repositoryUrl,
};
