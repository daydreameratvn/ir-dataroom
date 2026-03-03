import * as gcp from "@pulumi/gcp";
import { gcpConfig } from "../config.ts";

/**
 * GCP Provider configuration
 *
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
export const gcpProvider = new gcp.Provider("banyan-gcp-provider", {
  project: gcpConfig.project,
  region: gcpConfig.region,
});
