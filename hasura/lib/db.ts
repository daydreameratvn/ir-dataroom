/**
 * Shared database connection utility.
 *
 * Centralizes all DB credential handling to avoid recurring issues:
 * - Fetches from Secrets Manager (password is properly URL-encoded)
 * - Appends sslmode=require (RDS requires encrypted connections)
 * - Resolves pg_dump path (homebrew postgresql not linked by default)
 * - Rewrites host for SSM tunnel when needed
 *
 * Usage:
 *   import { getDbUrl, getPgDumpPath, TUNNEL_PORT } from "../lib/db.ts";
 *   const url = await getDbUrl({ tunnel: true });
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { execFileSync } from "child_process";
import { statSync } from "fs";

const REGION = "ap-southeast-1";
const SECRET_ID = "banyan-prod-db-credentials";

export const TUNNEL_PORT = 15432;

/**
 * Fetch the database connection URI from Secrets Manager.
 *
 * The URI stored in Secrets Manager has the password already URL-encoded
 * (done by Pulumi's encodeURIComponent at deploy time), so it is safe to
 * pass directly to dbmate, pg_dump, or any PostgreSQL client.
 *
 * Options:
 * - tunnel: rewrite host:port to localhost:TUNNEL_PORT
 */
export async function getDbUrl(opts?: { tunnel?: boolean }): Promise<string> {
  const client = new SecretsManagerClient({ region: REGION });
  const resp = await client.send(
    new GetSecretValueCommand({ SecretId: SECRET_ID }),
  );
  if (!resp.SecretString) {
    throw new Error(`Secret ${SECRET_ID} has no string value`);
  }
  const secret = JSON.parse(resp.SecretString);
  let uri: string = secret.connection_uri;

  // Rewrite for SSM tunnel
  if (opts?.tunnel) {
    uri = uri.replace(/@[^:]+:\d+\//, `@localhost:${TUNNEL_PORT}/`);
  }

  // RDS requires SSL — append sslmode if not already present
  if (!uri.includes("sslmode=")) {
    uri += uri.includes("?") ? "&sslmode=require" : "?sslmode=require";
  }

  return uri;
}

/**
 * Extract the RDS host from the Secrets Manager connection URI.
 * Used by tunnel.ts to set up port forwarding.
 */
export async function getRdsHost(): Promise<string> {
  const client = new SecretsManagerClient({ region: REGION });
  const resp = await client.send(
    new GetSecretValueCommand({ SecretId: SECRET_ID }),
  );
  if (!resp.SecretString) {
    throw new Error(`Secret ${SECRET_ID} has no string value`);
  }
  const secret = JSON.parse(resp.SecretString);
  const uri: string = secret.connection_uri;
  const match = uri.match(/@([^:]+):\d+\//);
  if (!match) throw new Error("Could not parse RDS host from connection URI");
  return match[1];
}

/**
 * Find pg_dump binary. Checks PATH first, then common homebrew locations.
 * Returns null if not found (caller decides whether to skip or error).
 */
export function getPgDumpPath(): string | null {
  // Check PATH
  try {
    return execFileSync("which", ["pg_dump"], { encoding: "utf-8" }).trim();
  } catch {
    // not in PATH
  }

  // Check common homebrew locations (macOS)
  const brewPaths = [
    "/opt/homebrew/opt/postgresql@16/bin/pg_dump",
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",
    "/opt/homebrew/opt/postgresql/bin/pg_dump",
    "/usr/local/opt/postgresql@16/bin/pg_dump",
    "/usr/local/opt/postgresql/bin/pg_dump",
  ];

  for (const p of brewPaths) {
    try {
      statSync(p);
      return p;
    } catch {
      // not found
    }
  }

  return null;
}
