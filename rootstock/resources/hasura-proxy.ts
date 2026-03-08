import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// CloudFront Reverse Proxy — Hasura DDN Cloud
// ============================================================
// Custom domain: banyan.services.papaya.asia
// Origin: banyan-prod.ddn.hasura.app (HTTPS)
// Purpose: Give DDN Cloud a branded endpoint (DDN doesn't support custom domains)

// ============================================================
// ACM Certificate — us-east-1 (required for CloudFront)
// ============================================================

const usEast1Provider = new aws.Provider("banyan-aws-us-east-1", {
  region: "us-east-1",
  profile: "banyan",
});

export const banyanHasuraProxyCert = new aws.acm.Certificate(
  "banyan-prod-hasura-proxy-cert",
  {
    domainName: "banyan.services.papaya.asia",
    validationMethod: "DNS",
    tags: mergeTags({
      Name: "banyan-prod-hasura-proxy-cert",
      Component: "acm",
      Service: "hasura-proxy",
    }),
  },
  { provider: usEast1Provider },
);

export const banyanHasuraProxyCertValidation =
  new aws.acm.CertificateValidation(
    "banyan-prod-hasura-proxy-cert-validation",
    { certificateArn: banyanHasuraProxyCert.arn },
    { provider: usEast1Provider },
  );

// ============================================================
// CloudFront Distribution
// ============================================================

// AWS Managed Policy IDs
const CACHING_DISABLED_POLICY_ID = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
// AllViewerExceptHostHeader: forwards all viewer headers except Host,
// so the origin receives its own hostname (required for reverse proxy)
const ALL_VIEWER_EXCEPT_HOST_POLICY_ID =
  "b689b0a8-53d0-40ab-baf2-68738e2966ac";

export const banyanHasuraProxyCf = new aws.cloudfront.Distribution(
  "banyan-prod-hasura-proxy-cf",
  {
    enabled: true,
    isIpv6Enabled: true,
    comment: "Banyan Hasura DDN Cloud reverse proxy",
    priceClass: "PriceClass_200",
    httpVersion: "http2and3",

    origins: [
      {
        originId: "ddn-cloud",
        domainName: "banyan-prod.ddn.hasura.app",
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "https-only",
          originSslProtocols: ["TLSv1.2"],
        },
      },
    ],

    defaultCacheBehavior: {
      targetOriginId: "ddn-cloud",
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
      originRequestPolicyId: ALL_VIEWER_EXCEPT_HOST_POLICY_ID,
    },

    aliases: ["banyan.services.papaya.asia"],
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },

    viewerCertificate: {
      acmCertificateArn: banyanHasuraProxyCert.arn,
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },

    tags: mergeTags({
      Name: "banyan-prod-hasura-proxy-cf",
      Component: "cloudfront",
      Service: "hasura-proxy",
    }),
  },
  { dependsOn: [banyanHasuraProxyCertValidation] },
);
