import { Hono } from "hono";
import { getTenantId, getClientInfo } from "../middleware.ts";
import {
  createOtpRequest,
  verifyOtp,
  sendEmailOtp,
  sendSmsOtp,
} from "../services/otp.ts";
import {
  findUserByEmail,
  findUserByPhone,
  getUserRoles,
  updateLastLogin,
  recordLoginAttempt,
} from "../services/user.ts";
import { signAccessToken } from "../services/jwt.ts";
import {
  generateRefreshToken,
  createSession,
} from "../services/session.ts";

const otp = new Hono();

// POST /auth/otp/email — send email OTP
otp.post("/otp/email", async (c) => {
  const body = await c.req.json<{ email: string }>();
  const tenantId = getTenantId(c);

  if (!body.email) {
    return c.json({ error: "Email is required" }, 400);
  }

  // Verify user exists before sending OTP
  const user = await findUserByEmail(tenantId, body.email);
  if (!user) {
    // Return success even if user doesn't exist to prevent enumeration
    return c.json({ success: true, message: "If the email exists, a code has been sent" });
  }

  const { code } = await createOtpRequest({
    tenantId,
    provider: "email_otp",
    destination: body.email,
  });

  try {
    await sendEmailOtp(body.email, code);
  } catch (err) {
    console.warn(`[OTP] Failed to send email to ${body.email}:`, (err as Error).message);
    console.warn(`[OTP] Code for ${body.email}: ${code}`);
  }

  return c.json({ success: true, message: "If the email exists, a code has been sent" });
});

// POST /auth/otp/phone — send phone OTP
otp.post("/otp/phone", async (c) => {
  const body = await c.req.json<{ phone: string }>();
  const tenantId = getTenantId(c);

  if (!body.phone) {
    return c.json({ error: "Phone number is required" }, 400);
  }

  const user = await findUserByPhone(tenantId, body.phone);
  if (!user) {
    return c.json({ success: true, message: "If the phone number exists, a code has been sent" });
  }

  const { code } = await createOtpRequest({
    tenantId,
    provider: "phone_otp",
    destination: body.phone,
  });

  try {
    await sendSmsOtp(body.phone, code);
  } catch (err) {
    console.warn(`[OTP] Failed to send SMS to ${body.phone}:`, (err as Error).message);
    console.warn(`[OTP] Code for ${body.phone}: ${code}`);
  }

  return c.json({ success: true, message: "If the phone number exists, a code has been sent" });
});

// POST /auth/otp/verify — verify OTP and issue tokens
otp.post("/otp/verify", async (c) => {
  const body = await c.req.json<{ destination: string; code: string }>();
  const tenantId = getTenantId(c);
  const { userAgent, ipAddress } = getClientInfo(c);

  if (!body.destination || !body.code) {
    return c.json({ error: "Destination and code are required" }, 400);
  }

  const result = await verifyOtp({
    tenantId,
    destination: body.destination,
    code: body.code,
  });

  if (!result.valid) {
    await recordLoginAttempt({
      tenantId,
      provider: result.provider || "email_otp",
      success: false,
      ipAddress,
      userAgent,
      failureReason: "invalid_otp",
    });
    return c.json({ error: "Invalid or expired code" }, 401);
  }

  // Find user by email or phone
  const isEmail = body.destination.includes("@");
  const user = isEmail
    ? await findUserByEmail(tenantId, body.destination)
    : await findUserByPhone(tenantId, body.destination);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const roles = getUserRoles(user);
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    role: roles.role,
    allowedRoles: roles.allowedRoles,
  });

  const refreshToken = generateRefreshToken();
  const session = await createSession({
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
    provider: result.provider!,
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

export default otp;
