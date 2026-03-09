import { Hono } from "hono";
import { createHmac } from "crypto";
import { getJwtKey } from "../config.ts";
import { getTenantId, getClientInfo } from "../middleware.ts";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
} from "../services/sso/google.ts";
import {
  getMicrosoftAuthUrl,
  exchangeMicrosoftCode,
} from "../services/sso/microsoft.ts";
import { getAppleAuthUrl, exchangeAppleCode } from "../services/sso/apple.ts";
import {
  findUserByIdentity,
  findUserByEmail,
  linkIdentity,
  updateLastLogin,
  recordLoginAttempt,
  getUserRoles,
  findAutoJoinProvider,
  autoProvisionUser,
} from "../services/user.ts";
import { signAccessToken } from "../services/jwt.ts";
import {
  generateRefreshToken,
  createSession,
} from "../services/session.ts";

const sso = new Hono();

interface SSOState {
  provider: string;
  tenantId: string;
  returnUrl: string;
  ts: string;
}

async function signState(data: SSOState): Promise<string> {
  const key = await getJwtKey();
  const payload = JSON.stringify(data);
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

async function verifyState(state: string): Promise<SSOState | null> {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const key = await getJwtKey();
  const expectedSig = createHmac("sha256", key)
    .update(encoded)
    .digest("base64url");

  if (expectedSig !== signature) return null;

  return JSON.parse(Buffer.from(encoded, "base64url").toString()) as SSOState;
}

// GET /auth/sso/:provider — redirect to OAuth provider
sso.get("/sso/:provider", async (c) => {
  const provider = c.req.param("provider");
  const tenantId = getTenantId(c);
  const returnUrl = c.req.query("return_url") || "/";

  const state = await signState({
    provider,
    tenantId,
    returnUrl,
    ts: String(Date.now()),
  });

  let authUrl: string;
  switch (provider) {
    case "google":
      authUrl = await getGoogleAuthUrl(state);
      break;
    case "microsoft":
      authUrl = await getMicrosoftAuthUrl(state);
      break;
    case "apple":
      authUrl = await getAppleAuthUrl(state);
      break;
    default:
      return c.json({ error: `Unsupported provider: ${provider}` }, 400);
  }

  return c.redirect(authUrl);
});

// GET /auth/callback/:provider — exchange code, issue tokens
sso.get("/callback/:provider", async (c) => {
  const provider = c.req.param("provider");
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !stateParam) {
    return c.redirect("/login?error=missing_params");
  }

  const state = await verifyState(stateParam);
  if (!state || state.provider !== provider) {
    return c.redirect("/login?error=invalid_state");
  }

  const tenantId = state.tenantId;
  const { userAgent, ipAddress } = getClientInfo(c);

  let providerUserId: string;
  let email: string;
  let name: string;

  switch (provider) {
    case "google": {
      const gUser = await exchangeGoogleCode(code);
      providerUserId = gUser.sub;
      email = gUser.email;
      name = gUser.name;
      break;
    }
    case "microsoft": {
      const mUser = await exchangeMicrosoftCode(code);
      providerUserId = mUser.id;
      email = mUser.mail || mUser.userPrincipalName;
      name = mUser.displayName;
      break;
    }
    case "apple": {
      const aUser = await exchangeAppleCode(code);
      providerUserId = aUser.sub;
      email = aUser.email;
      name = aUser.name ?? email.split("@")[0] ?? email;
      break;
    }
    default:
      return c.redirect("/login?error=unsupported_provider");
  }

  // Find user by identity or email
  let user = await findUserByIdentity(tenantId, provider, providerUserId);

  if (!user) {
    // Try to find by email and link the identity
    user = await findUserByEmail(tenantId, email);
    if (user) {
      await linkIdentity(tenantId, user.id, provider, providerUserId);
    }
  }

  // Auto-join: if no user found, check if domain auto-provisioning is configured
  if (!user) {
    const emailDomain = email.split("@")[1];
    if (emailDomain) {
      const autoJoinProvider = await findAutoJoinProvider(emailDomain, tenantId);
      if (autoJoinProvider) {
        user = await autoProvisionUser({
          tenantId,
          email,
          name,
          userType: autoJoinProvider.auto_join_user_type,
          userLevel: autoJoinProvider.auto_join_user_level,
          directoryProviderId: autoJoinProvider.id,
          directorySyncId: providerUserId,
        });
        await linkIdentity(tenantId, user.id, provider, providerUserId);
      }
    }
  }

  if (!user) {
    await recordLoginAttempt({
      tenantId,
      provider,
      success: false,
      ipAddress,
      userAgent,
      failureReason: "user_not_found",
    });
    return c.redirect("/login?error=user_not_found");
  }

  const roles = getUserRoles(user);
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    userType: user.userType,
    role: roles.role,
    allowedRoles: roles.allowedRoles,
    canImpersonate: user.canImpersonate,
  });

  const refreshToken = generateRefreshToken();
  await createSession({
    tenantId: user.tenantId,
    userId: user.id,
    refreshToken,
    userAgent,
    ipAddress,
  });

  await updateLastLogin(user.id);
  await recordLoginAttempt({
    tenantId,
    userId: user.id,
    provider,
    success: true,
    ipAddress,
    userAgent,
  });

  // Set refresh token as httpOnly cookie
  c.header(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${30 * 24 * 60 * 60}`
  );

  // Redirect to frontend with access token in URL fragment
  const returnUrl = state.returnUrl || "/";
  return c.redirect(
    `${returnUrl}#access_token=${accessToken}`
  );
});

export default sso;
