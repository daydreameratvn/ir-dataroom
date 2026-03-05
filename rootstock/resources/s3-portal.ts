import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// S3 Bucket — Portal Document Uploads
// ============================================================

export const banyanPortalDocumentsBucket = new aws.s3.Bucket(
  "banyan-portal-documents",
  {
    bucket: "banyan-portal-documents",
    tags: mergeTags({
      Name: "banyan-portal-documents",
      Component: "s3",
      Service: "portal",
    }),
  },
);

// Block all public access — documents are accessed via auth service proxy
const portalDocsBucketPublicAccess = new aws.s3.BucketPublicAccessBlock(
  "banyan-portal-documents-public-access",
  {
    bucket: banyanPortalDocumentsBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  },
);

// CORS — allow portal origin to upload directly if needed in the future
const portalDocsBucketCors = new aws.s3.BucketCorsConfigurationV2(
  "banyan-portal-documents-cors",
  {
    bucket: banyanPortalDocumentsBucket.id,
    corsRules: [
      {
        allowedHeaders: ["*"],
        allowedMethods: ["GET", "PUT", "POST"],
        allowedOrigins: [
          "https://oasis.papaya.asia",
          "http://localhost:5173",
        ],
        exposeHeaders: ["ETag"],
        maxAgeSeconds: 3600,
      },
    ],
  },
);

// Lifecycle — auto-delete incomplete multipart uploads after 7 days
const portalDocsLifecycle = new aws.s3.BucketLifecycleConfigurationV2(
  "banyan-portal-documents-lifecycle",
  {
    bucket: banyanPortalDocumentsBucket.id,
    rules: [
      {
        id: "abort-incomplete-multipart",
        status: "Enabled",
        abortIncompleteMultipartUpload: {
          daysAfterInitiation: 7,
        },
      },
    ],
  },
);
