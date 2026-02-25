import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import { SignJWT } from "jose";
import { mergeTags } from "../lib/tags.ts";

// ============================================================
// HMAC Secret Key (32 bytes, base64-encoded)
// ============================================================

const banyanJwtKeyBytes = new random.RandomBytes("banyan-prod-jwt-key", {
  length: 32,
});

// ============================================================
// Secrets Manager — store the raw HMAC key
// ============================================================

export const banyanJwtSecret = new aws.secretsmanager.Secret("banyan-prod-jwt-secret", {
  name: "banyan-prod-jwt-secret",
  description: "HMAC-SHA256 key for Hasura JWT authentication",
  tags: mergeTags({ Name: "banyan-prod-jwt-secret", Component: "secrets-manager" }),
});

new aws.secretsmanager.SecretVersion("banyan-prod-jwt-secret-version", {
  secretId: banyanJwtSecret.id,
  secretString: banyanJwtKeyBytes.base64.apply((b64) =>
    JSON.stringify({ key: b64 }),
  ),
});

// ============================================================
// Sign a static admin JWT (100-year expiry)
// ============================================================

const banyanAdminToken = banyanJwtKeyBytes.base64.apply(async (b64) => {
  // Hasura engine uses the base64 string directly as the HMAC key,
  // so we must sign with the same string (not the decoded bytes).
  const secret = new TextEncoder().encode(b64);

  const token = await new SignJWT({
    "https://hasura.io/jwt/claims": {
      "x-hasura-default-role": "admin",
      "x-hasura-allowed-roles": ["admin"],
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("banyan-admin")
    .setIssuedAt()
    .setExpirationTime("100y")
    .sign(secret);

  return token;
});

// ============================================================
// SSM Parameter — store the signed admin token
// ============================================================

export const banyanAdminTokenParam = new aws.ssm.Parameter("banyan-prod-admin-token", {
  name: "/banyan/hasura/admin-token",
  type: "SecureString",
  value: banyanAdminToken,
  description: "Pre-signed JWT admin token for Hasura engine",
  tags: mergeTags({ Name: "banyan-prod-admin-token", Component: "ssm" }),
});
