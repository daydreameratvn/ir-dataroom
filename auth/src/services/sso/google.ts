import { getOAuthConfig } from "../../config.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}

export async function getGoogleAuthUrl(state: string): Promise<string> {
  const config = await getOAuthConfig("google");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleUser> {
  const config = await getOAuthConfig("google");

  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
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
    throw new Error(`Google token exchange failed: ${tokenResp.status}`);
  }

  const tokenData = (await tokenResp.json()) as { access_token: string };

  const userResp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResp.ok) {
    throw new Error(`Google userinfo failed: ${userResp.status}`);
  }

  return userResp.json() as Promise<GoogleUser>;
}
