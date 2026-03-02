import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanAlb } from "./alb.ts";
import { banyanAuthTg } from "./ecs-auth.ts";
import { banyanAlbListenerHttp } from "./alb.ts";

// ============================================================
// S3 Bucket — Phoenix Static Assets
// ============================================================

export const banyanPhoenixBucket = new aws.s3.Bucket(
  "banyan-prod-phoenix",
  {
    bucket: "banyan-prod-phoenix",
    tags: mergeTags({
      Name: "banyan-prod-phoenix",
      Component: "s3",
      Service: "phoenix",
    }),
  },
);

// Block all public access — CloudFront uses OAC
const phoenixBucketPublicAccess = new aws.s3.BucketPublicAccessBlock(
  "banyan-prod-phoenix-public-access",
  {
    bucket: banyanPhoenixBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  },
);

// ============================================================
// CloudFront Origin Access Control (OAC)
// ============================================================

const phoenixOac = new aws.cloudfront.OriginAccessControl(
  "banyan-prod-phoenix-oac",
  {
    name: "banyan-prod-phoenix-oac",
    description: "OAC for Banyan Phoenix S3 bucket",
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
  },
);

// ============================================================
// CloudFront Cache & Origin Request Policies
// ============================================================

// AWS Managed Policy IDs
// CachingDisabled: no caching at all — used for API requests
const CACHING_DISABLED_POLICY_ID = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
// AllViewer: forward all viewer headers to origin (Authorization, Content-Type, etc.)
const ALL_VIEWER_ORIGIN_REQUEST_POLICY_ID = "216adef6-5c7f-47e4-b989-5492eafa07d3";

// ============================================================
// CloudFront Distribution
// ============================================================

export const banyanPhoenixCloudFront = new aws.cloudfront.Distribution(
  "banyan-prod-phoenix-cf",
  {
    enabled: true,
    isIpv6Enabled: true,
    comment: "Banyan Phoenix — claims portal + auth API",
    defaultRootObject: "index.html",
    priceClass: "PriceClass_200", // NA, EU, Asia, Middle East, Africa
    httpVersion: "http2and3",

    // --- Origins ---
    origins: [
      {
        originId: "s3-phoenix",
        domainName: banyanPhoenixBucket.bucketRegionalDomainName,
        originAccessControlId: phoenixOac.id,
      },
      {
        originId: "alb-auth",
        domainName: banyanAlb.dnsName,
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "http-only",
          originSslProtocols: ["TLSv1.2"],
        },
      },
    ],

    // --- Default Behavior: S3 phoenix ---
    defaultCacheBehavior: {
      targetOriginId: "s3-phoenix",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],
      compress: true,
      cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6", // CachingOptimized
      originRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf", // CORS-S3Origin
    },

    // --- Ordered Behaviors ---
    orderedCacheBehaviors: [
      {
        pathPattern: "/auth/*",
        targetOriginId: "alb-auth",
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: [
          "DELETE",
          "GET",
          "HEAD",
          "OPTIONS",
          "PATCH",
          "POST",
          "PUT",
        ],
        cachedMethods: ["GET", "HEAD"],
        compress: true,
        cachePolicyId: CACHING_DISABLED_POLICY_ID,
        originRequestPolicyId: ALL_VIEWER_ORIGIN_REQUEST_POLICY_ID,
      },
    ],

    // --- SPA Routing: 403/404 → index.html ---
    customErrorResponses: [
      {
        errorCode: 403,
        responsePagePath: "/index.html",
        responseCode: 200,
        errorCachingMinTtl: 0,
      },
      {
        errorCode: 404,
        responsePagePath: "/index.html",
        responseCode: 200,
        errorCachingMinTtl: 0,
      },
    ],

    // Custom domain: phoenix.papaya.asia
    // ACM cert must be in us-east-1 for CloudFront (AWS hard requirement)
    aliases: ["phoenix.papaya.asia"],
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },

    viewerCertificate: {
      acmCertificateArn:
        "arn:aws:acm:us-east-1:812652266901:certificate/4b70143b-b37f-4c03-9847-98cbb043d56f",
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },

    tags: mergeTags({
      Name: "banyan-prod-phoenix-cf",
      Component: "cloudfront",
      Service: "phoenix",
    }),
  },
);

// ============================================================
// S3 Bucket Policy — Allow CloudFront OAC
// ============================================================

const phoenixBucketPolicy = new aws.s3.BucketPolicy(
  "banyan-prod-phoenix-policy",
  {
    bucket: banyanPhoenixBucket.id,
    policy: pulumi
      .all([banyanPhoenixCloudFront.arn, banyanPhoenixBucket.arn])
      .apply(([cfArn, bucketArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "AllowCloudFrontOAC",
              Effect: "Allow",
              Principal: { Service: "cloudfront.amazonaws.com" },
              Action: "s3:GetObject",
              Resource: `${bucketArn}/*`,
              Condition: {
                StringEquals: { "AWS:SourceArn": cfArn },
              },
            },
          ],
        }),
      ),
  },
);
