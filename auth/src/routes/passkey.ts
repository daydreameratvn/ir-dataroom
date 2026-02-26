import { Hono } from "hono";
import { requireAuth, getTenantId, getClientInfo } from "../middleware.ts";
import {
  generateRegOptions,
  verifyRegResponse,
  storePasskey,
  generateAuthOptions,
  verifyAuthResponse,
  findUserByCredentialId,
} from "../services/passkey.ts";
import {
  findUserById,
  getUserRoles,
  updateLastLogin,
  recordLoginAttempt,
} from "../services/user.ts";
import { signAccessToken } from "../services/jwt.ts";
import { generateRefreshToken, createSession } from "../services/session.ts";

const passkey = new Hono();

// In-memory challenge store (use Redis in production for horizontal scaling)
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

function storeChallenge(key: string, challenge: string) {
  challenges.set(key, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
}

function getChallenge(key: string): string | null {
  const entry = challenges.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    challenges.delete(key);
    return null;
  }
  challenges.delete(key);
  return entry.challenge;
}

// POST /auth/passkey/register/options — requires auth
passkey.post("/passkey/register/options", requireAuth, async (c) => {
  const user = c.get("user");

  const options = await generateRegOptions(
    user.sub,
    user.name,
    user.tenantId
  );

  storeChallenge(`reg:${user.sub}`, options.challenge);

  return c.json(options);
});

// POST /auth/passkey/register/verify — requires auth
passkey.post("/passkey/register/verify", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json();

  const expectedChallenge = getChallenge(`reg:${user.sub}`);
  if (!expectedChallenge) {
    return c.json({ error: "Challenge expired or not found" }, 400);
  }

  const verification = await verifyRegResponse(body, expectedChallenge);

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: "Registration verification failed" }, 400);
  }

  const { credential } = verification.registrationInfo;

  await storePasskey({
    tenantId: user.tenantId,
    userId: user.sub,
    credentialId: Buffer.from(credential.id).toString("base64url"),
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    signCount: credential.counter,
    deviceName: (body as Record<string, string>).deviceName,
    transports: credential.transports?.join(","),
  });

  return c.json({ success: true });
});

// POST /auth/passkey/login/options — no auth required
passkey.post("/passkey/login/options", async (c) => {
  const body = await c.req.json<{ credentialId?: string }>();

  const options = await generateAuthOptions(body.credentialId);

  // Use a session-based key since user isn't authenticated yet
  const challengeKey = `auth:${options.challenge}`;
  storeChallenge(challengeKey, options.challenge);

  return c.json({ ...options, challengeKey });
});

// POST /auth/passkey/login/verify — no auth required
passkey.post("/passkey/login/verify", async (c) => {
  const body = await c.req.json<{
    challengeKey: string;
    response: Record<string, unknown>;
  }>();
  const tenantId = getTenantId(c);
  const { userAgent, ipAddress } = getClientInfo(c);

  const expectedChallenge = getChallenge(body.challengeKey);
  if (!expectedChallenge) {
    return c.json({ error: "Challenge expired or not found" }, 400);
  }

  const result = await verifyAuthResponse(body.response, expectedChallenge);

  if (!result?.verified) {
    await recordLoginAttempt({
      tenantId,
      provider: "passkey",
      success: false,
      ipAddress,
      userAgent,
      failureReason: "passkey_verification_failed",
    });
    return c.json({ error: "Authentication failed" }, 401);
  }

  const passkeyUser = await findUserByCredentialId(result.credentialId);
  if (!passkeyUser) {
    return c.json({ error: "Credential not linked to any user" }, 404);
  }

  const user = await findUserById(passkeyUser.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
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
    provider: "passkey",
    success: true,
    ipAddress,
    userAgent,
  });

  c.header(
    "Set-Cookie",
    `refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${30 * 24 * 60 * 60}`
  );

  return c.json({
    accessToken,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      userType: user.userType,
      userLevel: user.userLevel,
    },
  });
});

export default passkey;
