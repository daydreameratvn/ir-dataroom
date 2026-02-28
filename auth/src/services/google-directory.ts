import { getOAuthConfig } from "../config.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DIRECTORY_URL =
  "https://admin.googleapis.com/admin/directory/v1/users";

const ADMIN_SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";

export interface GoogleDirectoryUser {
  id: string;
  primaryEmail: string;
  name: {
    givenName: string;
    familyName: string;
    fullName: string;
  };
  suspended: boolean;
  isAdmin: boolean;
  orgUnitPath: string;
}

interface GoogleDirectoryListResponse {
  users?: GoogleDirectoryUser[];
  nextPageToken?: string;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function getAdminConsentUrl(state: string): Promise<string> {
  const config = await getOAuthConfig("google");
  const baseUrl = process.env.AUTH_BASE_URL || "https://oasis.papaya.asia";
  const redirectUri = `${baseUrl}/auth/admin/directory/callback/google`;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `openid email profile ${ADMIN_SCOPE}`,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeAdminConsentCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string; email: string }> {
  const config = await getOAuthConfig("google");
  const baseUrl = process.env.AUTH_BASE_URL || "https://oasis.papaya.asia";
  const redirectUri = `${baseUrl}/auth/admin/directory/callback/google`;

  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    throw new Error(`Google token exchange failed: ${tokenResp.status} ${body}`);
  }

  const tokenData = (await tokenResp.json()) as GoogleTokenResponse;

  if (!tokenData.refresh_token) {
    throw new Error("No refresh token received — admin must re-consent with prompt=consent");
  }

  // Get the admin's email from userinfo
  const userinfoResp = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  if (!userinfoResp.ok) {
    throw new Error(`Failed to get admin userinfo: ${userinfoResp.status}`);
  }
  const userinfo = (await userinfoResp.json()) as { email: string };

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    email: userinfo.email,
  };
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<string> {
  const config = await getOAuthConfig("google");

  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    throw new Error(`Google token refresh failed: ${tokenResp.status} ${body}`);
  }

  const tokenData = (await tokenResp.json()) as GoogleTokenResponse;
  return tokenData.access_token;
}

export async function listDirectoryUsers(
  accessToken: string,
  customerId: string,
  pageToken?: string
): Promise<GoogleDirectoryListResponse> {
  const params = new URLSearchParams({
    customer: customerId,
    maxResults: "500",
    orderBy: "email",
    projection: "basic",
  });
  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const resp = await fetch(`${GOOGLE_DIRECTORY_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `Google Directory API failed: ${resp.status} ${body}`
    );
  }

  return resp.json() as Promise<GoogleDirectoryListResponse>;
}

export async function getCustomerId(
  accessToken: string
): Promise<string> {
  // Get the customer ID from the About API
  const resp = await fetch(
    `${GOOGLE_DIRECTORY_URL}?customer=my_customer&maxResults=1&projection=basic`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to get customer ID: ${resp.status} ${body}`);
  }

  const data = (await resp.json()) as GoogleDirectoryListResponse;
  // The customer ID isn't directly in the list response,
  // but we can use "my_customer" alias for all Directory API calls
  // Return the alias — it works for all API calls
  return "my_customer";
}
