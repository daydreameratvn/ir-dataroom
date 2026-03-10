import { SignJWT, jwtVerify, importSPKI } from "jose";
import { getJwtKey, getBerryPublicKey } from "../config.ts";
import { authConfig } from "../config.ts";

interface HasuraClaims {
  "x-hasura-default-role": string;
  "x-hasura-allowed-roles": string[];
  "x-hasura-user-id": string;
  "x-hasura-tenant-id": string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  userType: string;
  role: string;
  allowedRoles: string[];
  impersonatorId?: string;
  canImpersonate?: boolean;
}

let cachedSecret: Uint8Array | null = null;

async function getSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  const key = await getJwtKey();
  cachedSecret = new TextEncoder().encode(key);
  return cachedSecret;
}

export async function signAccessToken(payload: TokenPayload): Promise<string> {
  const secret = await getSecret();

  const hasuraClaims: HasuraClaims = {
    "x-hasura-default-role": payload.role,
    "x-hasura-allowed-roles": payload.allowedRoles,
    "x-hasura-user-id": payload.sub,
    "x-hasura-tenant-id": payload.tenantId,
  };

  const claims: Record<string, unknown> = {
    "https://hasura.io/jwt/claims": hasuraClaims,
    email: payload.email,
    name: payload.name,
    userType: payload.userType,
  };

  if (payload.impersonatorId) {
    claims.impersonatorId = payload.impersonatorId;
  }

  if (payload.canImpersonate) {
    claims.canImpersonate = true;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(authConfig.accessTokenExpiry)
    .sign(secret);
}

let cachedBerryKey: CryptoKey | null = null;

async function getBerryKey(): Promise<CryptoKey | null> {
  if (cachedBerryKey) return cachedBerryKey;
  const pem = await getBerryPublicKey();
  if (!pem) return null;
  cachedBerryKey = await importSPKI(pem, "RS512");
  return cachedBerryKey;
}

function extractBanyanPayload(payload: Record<string, unknown>): TokenPayload {
  const claims = payload["https://hasura.io/jwt/claims"] as HasuraClaims;
  const impersonatorId = payload.impersonatorId as string | undefined;
  const canImpersonate = payload.canImpersonate as boolean | undefined;

  return {
    sub: payload.sub as string,
    email: payload.email as string,
    name: payload.name as string,
    tenantId: claims["x-hasura-tenant-id"],
    userType: payload.userType as string,
    role: claims["x-hasura-default-role"],
    allowedRoles: claims["x-hasura-allowed-roles"],
    ...(impersonatorId ? { impersonatorId } : {}),
    ...(canImpersonate ? { canImpersonate } : {}),
  };
}

function extractBerryPayload(payload: Record<string, unknown>): TokenPayload {
  const hasuraClaims = (payload["hasura.claims"] ??
    payload["https://hasura.io/jwt/claims"]) as HasuraClaims | undefined;

  return {
    sub: hasuraClaims?.["x-hasura-user-id"] ?? (payload.sub as string),
    email: (payload.email as string) ?? "",
    name: (payload.name as string) ?? "",
    tenantId: hasuraClaims?.["x-hasura-tenant-id"] ?? "",
    userType: "berry",
    role: hasuraClaims?.["x-hasura-default-role"] ?? "viewer",
    allowedRoles: hasuraClaims?.["x-hasura-allowed-roles"] ?? ["viewer"],
  };
}

export async function verifyAccessToken(
  token: string
): Promise<TokenPayload | null> {
  // Try Banyan HS256 first
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret);
    return extractBanyanPayload(payload as Record<string, unknown>);
  } catch {
    // Not a valid Banyan token — try Berry RS512
  }

  // Try Berry RS512
  try {
    const berryKey = await getBerryKey();
    if (!berryKey) return null;
    const { payload } = await jwtVerify(token, berryKey, {
      issuer: "papaya.asia",
      audience: "papaya.asia",
    });
    return extractBerryPayload(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}
