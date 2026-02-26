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

export async function getDbUrl(): Promise<string> {
  if (cachedDbUrl) return cachedDbUrl;

  if (process.env.DATABASE_URL) {
    cachedDbUrl = process.env.DATABASE_URL;
    return cachedDbUrl;
  }

  const secretName = process.env.DB_SECRET_NAME || "banyan-prod-db-secret";
  const resp = await smClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  const secret = JSON.parse(resp.SecretString!);
  const password = encodeURIComponent(secret.password);
  cachedDbUrl = `postgresql://${secret.username}:${password}@${secret.host}:${secret.port}/${secret.dbname}?sslmode=require`;
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

  const baseUrl = process.env.AUTH_BASE_URL || "https://api.papaya.insure";
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
  rpId: process.env.RP_ID || "papaya.insure",
  rpOrigin: process.env.RP_ORIGIN || "https://app.papaya.insure",
};
