import * as aws from "@pulumi/aws";
import { mergeTags } from "../lib/tags.ts";
import { oauthConfig } from "../config.ts";

// ============================================================
// SSM Parameters for OAuth Client Credentials
//
// Values come from Pulumi config secrets (encrypted in state).
// Set via: pulumi config set --secret banyan-ddn:<key> <value>
// ============================================================

// Google OAuth
export const googleClientId = new aws.ssm.Parameter("banyan-prod-auth-google-client-id", {
  name: "/banyan/auth/google/client-id",
  type: "SecureString",
  value: oauthConfig.google.clientId,
  description: "Google OAuth client ID",
  tags: mergeTags({ Name: "banyan-prod-auth-google-client-id", Component: "ssm", Service: "auth" }),
});

export const googleClientSecret = new aws.ssm.Parameter("banyan-prod-auth-google-client-secret", {
  name: "/banyan/auth/google/client-secret",
  type: "SecureString",
  value: oauthConfig.google.clientSecret,
  description: "Google OAuth client secret",
  tags: mergeTags({ Name: "banyan-prod-auth-google-client-secret", Component: "ssm", Service: "auth" }),
});

// Microsoft OAuth
export const microsoftClientId = new aws.ssm.Parameter("banyan-prod-auth-microsoft-client-id", {
  name: "/banyan/auth/microsoft/client-id",
  type: "SecureString",
  value: oauthConfig.microsoft.clientId,
  description: "Microsoft OAuth client ID",
  tags: mergeTags({ Name: "banyan-prod-auth-microsoft-client-id", Component: "ssm", Service: "auth" }),
});

export const microsoftClientSecret = new aws.ssm.Parameter("banyan-prod-auth-microsoft-client-secret", {
  name: "/banyan/auth/microsoft/client-secret",
  type: "SecureString",
  value: oauthConfig.microsoft.clientSecret,
  description: "Microsoft OAuth client secret",
  tags: mergeTags({ Name: "banyan-prod-auth-microsoft-client-secret", Component: "ssm", Service: "auth" }),
});

// Apple OAuth
export const appleClientId = new aws.ssm.Parameter("banyan-prod-auth-apple-client-id", {
  name: "/banyan/auth/apple/client-id",
  type: "SecureString",
  value: oauthConfig.apple.clientId,
  description: "Apple Sign In client ID (service ID)",
  tags: mergeTags({ Name: "banyan-prod-auth-apple-client-id", Component: "ssm", Service: "auth" }),
});

export const appleClientSecret = new aws.ssm.Parameter("banyan-prod-auth-apple-client-secret", {
  name: "/banyan/auth/apple/client-secret",
  type: "SecureString",
  value: oauthConfig.apple.clientSecret,
  description: "Apple Sign In client secret (signed JWT)",
  tags: mergeTags({ Name: "banyan-prod-auth-apple-client-secret", Component: "ssm", Service: "auth" }),
});
