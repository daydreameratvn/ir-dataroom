import * as gcp from "@pulumi/gcp";
import { gcpProvider } from "../../providers/gcp.ts";

// ============================================================
// Enable Required GCP APIs
// ============================================================

const apis = [
  { name: "admin", service: "admin.googleapis.com", description: "Google Workspace Admin SDK (directory sync)" },
  { name: "people", service: "people.googleapis.com", description: "People API (user profile info for SSO)" },
  { name: "iam", service: "iam.googleapis.com", description: "IAM API (identity and access management)" },
];

export const gcpEnabledApis = apis.map(
  (api) =>
    new gcp.projects.Service(`banyan-gcp-api-${api.name}`, {
      service: api.service,
      disableOnDestroy: false,
    }, { provider: gcpProvider }),
);
