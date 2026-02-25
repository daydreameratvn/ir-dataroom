import * as aws from "@pulumi/aws";
import { domainConfig } from "../config.ts";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// ACM Certificate (DNS-validated wildcard)
// ============================================================

export const banyanCertificate = new aws.acm.Certificate("banyan-prod-cert", {
  domainName: domainConfig.domainName,
  subjectAlternativeNames: [`*.${domainConfig.domainName}`],
  validationMethod: "DNS",
  tags: mergeTags({ Name: "banyan-prod-cert", Component: "acm" }),
});

// ============================================================
// Certificate Validation
// Blocks until the DNS CNAME record is added in the other account
// ============================================================

export const banyanCertValidation = new aws.acm.CertificateValidation(
  "banyan-prod-cert-validation",
  { certificateArn: banyanCertificate.arn },
);
