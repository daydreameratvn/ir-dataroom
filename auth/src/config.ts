import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const region = process.env.AWS_REGION || "ap-southeast-1";
const smClient = new SecretsManagerClient({ region });
const ssmClient = new SSMClient({ region });

let cachedDbUrl: string | null = null;
let cachedJwtKey: string | null = null;

function buildDbUrl(secret: {
  username: string;
  password: string;
  host: string;
  port: number | string;
  dbname: string;
}): string {
  const password = encodeURIComponent(secret.password);
  return `postgresql://${secret.username}:${password}@${secret.host}:${secret.port}/${secret.dbname}`;
}

export async function getDbUrl(): Promise<string> {
  if (cachedDbUrl) return cachedDbUrl;

  if (process.env.DATABASE_URL) {
    let url = process.env.DATABASE_URL;
    // ECS secret injection provides the raw JSON object, not a connection string
    if (url.trimStart().startsWith("{")) {
      const secret = JSON.parse(url);
      url = buildDbUrl(secret);
    }
    cachedDbUrl = url;
    return cachedDbUrl;
  }

  const secretName = process.env.DB_SECRET_NAME || "banyan-prod-db-credentials";
  const resp = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  const secret = JSON.parse(resp.SecretString!);
  cachedDbUrl = buildDbUrl(secret);
  return cachedDbUrl;
}

export async function getJwtKey(): Promise<string> {
  if (cachedJwtKey) return cachedJwtKey;

  if (process.env.JWT_SECRET_KEY) {
    cachedJwtKey = process.env.JWT_SECRET_KEY;
    return cachedJwtKey;
  }

  const secretName = process.env.JWT_SECRET_NAME || "banyan-prod-jwt-secret";
  const resp = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  const secret = JSON.parse(resp.SecretString!);
  cachedJwtKey = secret.key as string;
  return cachedJwtKey;
}

async function getSSMParam(name: string): Promise<string> {
  const resp = await ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );
  return resp.Parameter!.Value!;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

let cachedOAuthConfigs: Record<string, OAuthConfig> | null = null;

export async function getOAuthConfig(
  provider: string
): Promise<OAuthConfig> {
  if (cachedOAuthConfigs?.[provider]) return cachedOAuthConfigs[provider];

  if (!cachedOAuthConfigs) cachedOAuthConfigs = {};

  const prefix = `/banyan/auth/${provider}`;
  const [clientId, clientSecret] = await Promise.all([
    getSSMParam(`${prefix}/client-id`),
    getSSMParam(`${prefix}/client-secret`),
  ]);

  const baseUrl = process.env.AUTH_BASE_URL || "https://oasis.papaya.asia";
  const redirectUri = `${baseUrl}/auth/callback/${provider}`;

  cachedOAuthConfigs[provider] = { clientId, clientSecret, redirectUri };
  return cachedOAuthConfigs[provider];
}

export const authConfig = {
  port: Number(process.env.PORT || 4000),
  accessTokenExpiry: "15m" as const,
  refreshTokenDays: 30,
  otpExpiry: 10 * 60 * 1000, // 10 minutes
  otpMaxAttempts: 5,
  rpName: "Papaya Insurance",
  rpId: process.env.RP_ID || "papaya.asia",
  rpOrigin: process.env.RP_ORIGIN || "https://oasis.papaya.asia",
};
