import { getOAuthConfig } from "../../config.ts";
import { jwtVerify, createRemoteJWKSet } from "jose";

const APPLE_AUTH_URL = "https://appleid.apple.com/auth/authorize";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

const appleJWKS = createRemoteJWKSet(new URL(APPLE_JWKS_URL));

export interface AppleUser {
  sub: string;
  email: string;
  name?: string;
  email_verified: boolean;
}

export async function getAppleAuthUrl(state: string): Promise<string> {
  const config = await getOAuthConfig("apple");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "name email",
    state,
    response_mode: "form_post",
  });
  return `${APPLE_AUTH_URL}?${params}`;
}

export async function exchangeAppleCode(code: string): Promise<AppleUser> {
  const config = await getOAuthConfig("apple");

  const tokenResp = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    throw new Error(`Apple token exchange failed: ${tokenResp.status}`);
  }

  const tokenData = (await tokenResp.json()) as { id_token: string };

  // Verify and decode the id_token using Apple's JWKS
  const { payload } = await jwtVerify(tokenData.id_token, appleJWKS, {
    issuer: "https://appleid.apple.com",
    audience: config.clientId,
  });

  return {
    sub: payload.sub!,
    email: payload.email as string,
    name: undefined, // Apple only provides name on first login via form_post
    email_verified: (payload.email_verified as boolean) ?? false,
  };
}
