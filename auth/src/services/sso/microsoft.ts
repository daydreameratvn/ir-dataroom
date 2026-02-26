import { getOAuthConfig } from "../../config.ts";

const MS_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_GRAPH_URL = "https://graph.microsoft.com/v1.0/me";

export interface MicrosoftUser {
  id: string;
  mail: string;
  displayName: string;
  userPrincipalName: string;
}

export async function getMicrosoftAuthUrl(state: string): Promise<string> {
  const config = await getOAuthConfig("microsoft");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile User.Read",
    state,
    response_mode: "query",
    prompt: "select_account",
  });
  return `${MS_AUTH_URL}?${params}`;
}

export async function exchangeMicrosoftCode(
  code: string
): Promise<MicrosoftUser> {
  const config = await getOAuthConfig("microsoft");

  const tokenResp = await fetch(MS_TOKEN_URL, {
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
    throw new Error(`Microsoft token exchange failed: ${tokenResp.status}`);
  }

  const tokenData = (await tokenResp.json()) as { access_token: string };

  const userResp = await fetch(MS_GRAPH_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResp.ok) {
    throw new Error(`Microsoft Graph API failed: ${userResp.status}`);
  }

  return userResp.json() as Promise<MicrosoftUser>;
}
