import { Hono } from "hono";
import { createHmac } from "crypto";
import { getJwtKey } from "../config.ts";
import { getTenantId, getClientInfo } from "../middleware.ts";
import {
  getWorkOSClient,
  getWorkOSClientId,
  getWorkOSRedirectUri,
} from "../services/workos.ts";
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

const workos = new Hono();

// ---------------------------------------------------------------------------
// State signing — same pattern as existing SSO routes
// ---------------------------------------------------------------------------

interface WorkOSState {
  tenantId: string;
  returnUrl: string;
  ts: string;
}

async function signState(data: WorkOSState): Promise<string> {
  const key = await getJwtKey();
  const payload = JSON.stringify(data);
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

async function verifyState(state: string): Promise<WorkOSState | null> {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  const key = await getJwtKey();
  const expectedSig = createHmac("sha256", key)
    .update(encoded)
    .digest("base64url");

  if (expectedSig !== signature) return null;

  return JSON.parse(
    Buffer.from(encoded, "base64url").toString(),
  ) as WorkOSState;
}

// ---------------------------------------------------------------------------
// GET /workos/login — redirect to WorkOS AuthKit
// ---------------------------------------------------------------------------

workos.get("/workos/login", async (c) => {
  const tenantId = getTenantId(c);
  const returnUrl = c.req.query("return_url") || "/";

  const state = await signState({
    tenantId,
    returnUrl,
    ts: String(Date.now()),
  });

  const client = await getWorkOSClient();
  const clientId = await getWorkOSClientId();
  const redirectUri = getWorkOSRedirectUri();

  const authorizationUrl = client.userManagement.getAuthorizationUrl({
    clientId,
    redirectUri,
    provider: "authkit",
    state,
  });

  return c.redirect(authorizationUrl);
});

// ---------------------------------------------------------------------------
// GET /workos/callback — exchange code, issue tokens
// ---------------------------------------------------------------------------

workos.get("/workos/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");
  const errorDescription = c.req.query("error_description");

  if (error) {
    const msg = errorDescription || error;
    return c.redirect(`/login?error=${encodeURIComponent(msg)}`);
  }

  if (!code) {
    return c.redirect("/login?error=missing_code");
  }

  // State is optional — WorkOS may not return it in all flows
  let tenantId: string;
  let returnUrl = "/";

  if (stateParam) {
    const state = await verifyState(stateParam);
    if (!state) {
      return c.redirect("/login?error=invalid_state");
    }
    tenantId = state.tenantId;
    returnUrl = state.returnUrl;
  } else {
    tenantId = getTenantId(c);
  }

  const { userAgent, ipAddress } = getClientInfo(c);

  // Exchange code with WorkOS
  const client = await getWorkOSClient();
  const clientId = await getWorkOSClientId();

  let workosUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    emailVerified: boolean;
  };
  let organizationId: string | undefined;

  try {
    const authResult = await client.userManagement.authenticateWithCode({
      clientId,
      code,
      ipAddress,
      userAgent,
    });
    workosUser = authResult.user;
    organizationId = authResult.organizationId ?? undefined;
  } catch (err) {
    console.error("[WorkOS] Code exchange failed:", err);
    await recordLoginAttempt({
      tenantId,
      provider: "workos",
      success: false,
      ipAddress,
      userAgent,
      failureReason: "code_exchange_failed",
    });
    return c.redirect("/login?error=authentication_failed");
  }

  const email = workosUser.email;
  const name = [workosUser.firstName, workosUser.lastName]
    .filter(Boolean)
    .join(" ") || email.split("@")[0] || email;

  // Find user by WorkOS identity or email
  let user = await findUserByIdentity(tenantId, "workos", workosUser.id);

  if (!user) {
    // Try to find by email and link the WorkOS identity
    user = await findUserByEmail(tenantId, email);
    if (user) {
      await linkIdentity(tenantId, user.id, "workos", workosUser.id);
    }
  }

  // Auto-join: if no user found, check if domain auto-provisioning is configured
  if (!user) {
    const emailDomain = email.split("@")[1];
    if (emailDomain) {
      const autoJoinProvider = await findAutoJoinProvider(
        emailDomain,
        tenantId,
      );
      if (autoJoinProvider) {
        user = await autoProvisionUser({
          tenantId,
          email,
          name,
          userType: autoJoinProvider.autoJoinUserType,
          userLevel: autoJoinProvider.autoJoinUserLevel,
          directoryProviderId: autoJoinProvider.id,
        });
        await linkIdentity(tenantId, user.id, "workos", workosUser.id);
      }
    }
  }

  if (!user) {
    await recordLoginAttempt({
      tenantId,
      provider: "workos",
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
    provider: "workos",
    success: true,
    ipAddress,
    userAgent,
  });

  // Set refresh token as httpOnly cookie
  c.header(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${30 * 24 * 60 * 60}`,
  );

  // Redirect to frontend with access token in URL fragment
  return c.redirect(`${returnUrl}#access_token=${accessToken}`);
});

export default workos;
