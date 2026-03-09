import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { mergeTags } from "../lib/tags.ts";
import { banyanAlb } from "./alb.ts";
import { banyanAuthTg } from "./ecs-auth.ts";
import { banyanAlbListenerHttp } from "./alb.ts";

// ============================================================
// S3 Bucket — Frontend Static Assets
// ============================================================

export const banyanFrontendBucket = new aws.s3.Bucket(
  "banyan-prod-frontend",
  {
    bucket: "banyan-prod-frontend",
    tags: mergeTags({
      Name: "banyan-prod-frontend",
      Component: "s3",
      Service: "frontend",
    }),
  },
);

// Block all public access — CloudFront uses OAC
const frontendBucketPublicAccess = new aws.s3.BucketPublicAccessBlock(
  "banyan-prod-frontend-public-access",
  {
    bucket: banyanFrontendBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  },
);

// ============================================================
// CloudFront Origin Access Control (OAC)
// ============================================================

const frontendOac = new aws.cloudfront.OriginAccessControl(
  "banyan-prod-frontend-oac",
  {
    name: "banyan-prod-frontend-oac",
    description: "OAC for Banyan frontend S3 bucket",
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
  },
);

// ============================================================
// ALB HTTP Listener Rule — forward /auth/* (for CloudFront origin)
// ============================================================

// CloudFront connects to the ALB via HTTP (port 80) for API calls.
// This rule forwards /auth/* instead of redirecting to HTTPS.
const albHttpAuthRule = new aws.lb.ListenerRule(
  "banyan-prod-alb-http-auth-rule",
  {
    listenerArn: banyanAlbListenerHttp.arn,
    priority: 100,
    conditions: [
      {
        pathPattern: {
          values: ["/auth/*"],
        },
      },
    ],
    actions: [
      {
        type: "forward",
        targetGroupArn: banyanAuthTg.arn,
      },
    ],
    tags: mergeTags({
      Name: "banyan-prod-alb-http-auth-rule",
      Component: "alb",
      Service: "frontend",
    }),
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
// CloudFront Function — SPA Routing
// ============================================================
// Rewrites non-file URIs to /index.html so S3 never returns 403/404.
// This replaces customErrorResponses which intercepted ALL origins
// (including API /auth/* responses), breaking JSON error responses.

const spaRoutingFunction = new aws.cloudfront.Function(
  "banyan-prod-spa-routing",
  {
    name: "banyan-prod-spa-routing",
    runtime: "cloudfront-js-2.0",
    comment: "SPA routing: rewrite non-file paths to /index.html",
    code: `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  // Pass through requests with file extensions (JS, CSS, images, fonts, etc.)
  if (uri.includes('.')) return request;
  // SPA fallback: rewrite to /index.html
  request.uri = '/index.html';
  return request;
}
`,
    publish: true,
  },
);

// ============================================================
// CloudFront Distribution
// ============================================================

export const banyanCloudFront = new aws.cloudfront.Distribution(
  "banyan-prod-cf",
  {
    enabled: true,
    isIpv6Enabled: true,
    comment: "Banyan Oasis Platform — frontend + auth API",
    defaultRootObject: "index.html",
    priceClass: "PriceClass_200", // NA, EU, Asia, Middle East, Africa
    httpVersion: "http2and3",

    // --- Origins ---
    origins: [
      {
        originId: "s3-frontend",
        domainName: banyanFrontendBucket.bucketRegionalDomainName,
        originAccessControlId: frontendOac.id,
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

    // --- Default Behavior: S3 frontend ---
    // SPA routing handled by CloudFront Function (not customErrorResponses)
    defaultCacheBehavior: {
      targetOriginId: "s3-frontend",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],
      compress: true,
      cachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6", // CachingOptimized
      originRequestPolicyId: "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf", // CORS-S3Origin
      functionAssociations: [
        {
          eventType: "viewer-request",
          functionArn: spaRoutingFunction.arn,
        },
      ],
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

    // NOTE: customErrorResponses REMOVED — they intercepted ALL origins
    // (including /auth/* API responses), converting JSON 403/404 errors
    // to 200+HTML which broke the frontend. SPA routing is now handled
    // by the CloudFront Function above which only affects the S3 behavior.

    // Custom domain: oasis.papaya.asia
    // ACM cert must be in us-east-1 for CloudFront (AWS hard requirement)
    aliases: ["oasis.papaya.asia"],
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },

    viewerCertificate: {
      acmCertificateArn:
        "arn:aws:acm:us-east-1:812652266901:certificate/f446a33f-1c60-4fc8-8049-fd7d67af67a3",
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },

    tags: mergeTags({
      Name: "banyan-prod-cf",
      Component: "cloudfront",
      Service: "frontend",
    }),
  },
);

// ============================================================
// S3 Bucket Policy — Allow CloudFront OAC
// ============================================================

const frontendBucketPolicy = new aws.s3.BucketPolicy(
  "banyan-prod-frontend-policy",
  {
    bucket: banyanFrontendBucket.id,
    policy: pulumi
      .all([banyanCloudFront.arn, banyanFrontendBucket.arn])
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
