import { SignJWT, jwtVerify } from "jose";
import { getJwtKey } from "../config.ts";
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

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(authConfig.accessTokenExpiry)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret);
    const claims = (payload as Record<string, unknown>)[
      "https://hasura.io/jwt/claims"
    ] as HasuraClaims;

    const impersonatorId = (payload as Record<string, unknown>).impersonatorId as string | undefined;

    return {
      sub: payload.sub!,
      email: (payload as Record<string, unknown>).email as string,
      name: (payload as Record<string, unknown>).name as string,
      tenantId: claims["x-hasura-tenant-id"],
      userType: (payload as Record<string, unknown>).userType as string,
      role: claims["x-hasura-default-role"],
      allowedRoles: claims["x-hasura-allowed-roles"],
      ...(impersonatorId ? { impersonatorId } : {}),
    };
  } catch {
    return null;
  }
}
