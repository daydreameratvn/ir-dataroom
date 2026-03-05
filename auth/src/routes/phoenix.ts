import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { getTenantId } from "../middleware.ts";
import { getJwtKey } from "../config.ts";
import { createOtpRequest, verifyOtp, sendEmailOtp } from "../services/otp.ts";
import {
  findPolicyByNumber,
  listClaimsForPolicy,
  getClaimWithDetails,
  createClaim,
  createClaimDocument,
} from "../services/phoenix.ts";

// ---------------------------------------------------------------------------
// Phoenix JWT helpers (separate from platform / investor JWTs)
// ---------------------------------------------------------------------------

interface PhoenixTokenPayload {
  sub: string;
  policyNumber: string;
  insuredName: string;
  insuredEmail: string | null;
  insuredPhone: string | null;
  tenantId: string;
  userType: "policyholder";
  role: "policyholder";
  "https://hasura.io/jwt/claims": {
    "x-hasura-default-role": "policyholder";
    "x-hasura-allowed-roles": ["policyholder"];
    "x-hasura-user-id": string;
    "x-hasura-tenant-id": string;
  };
}

let cachedSecret: Uint8Array | null = null;

async function getSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  const key = await getJwtKey();
  cachedSecret = new TextEncoder().encode(key);
  return cachedSecret;
}

async function signPhoenixToken(payload: PhoenixTokenPayload): Promise<string> {
  const secret = await getSecret();
  return new SignJWT({
    policyNumber: payload.policyNumber,
    insuredName: payload.insuredName,
    insuredEmail: payload.insuredEmail,
    insuredPhone: payload.insuredPhone,
    tenantId: payload.tenantId,
    userType: payload.userType,
    role: payload.role,
    "https://hasura.io/jwt/claims": payload["https://hasura.io/jwt/claims"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

async function verifyPhoenixToken(token: string): Promise<PhoenixTokenPayload | null> {
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as Record<string, unknown>;
    if (p.userType !== "policyholder") return null;
    return {
      sub: payload.sub!,
      policyNumber: p.policyNumber as string,
      insuredName: p.insuredName as string,
      insuredEmail: (p.insuredEmail as string | null) ?? null,
      insuredPhone: (p.insuredPhone as string | null) ?? null,
      tenantId: p.tenantId as string,
      userType: "policyholder",
      role: "policyholder",
      "https://hasura.io/jwt/claims": p["https://hasura.io/jwt/claims"] as PhoenixTokenPayload["https://hasura.io/jwt/claims"],
    };
  } catch {
    return null;
  }
}

/** Middleware to require Phoenix (policyholder) JWT authentication */
async function requirePhoenix(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyPhoenixToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("phoenix", payload);
  return next();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const phoenix = new Hono<{
  Variables: {
    phoenix: PhoenixTokenPayload;
  };
}>();

// ── Apply middleware for protected routes ─────────────────────────────────

phoenix.use("/phoenix/claims", requirePhoenix);
phoenix.use("/phoenix/claims/*", requirePhoenix);
phoenix.use("/phoenix/token/*", requirePhoenix);

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ── Login (public) ────────────────────────────────────────────────────────

phoenix.post("/phoenix/login", async (c) => {
  const body = await c.req.json<{ policyNumbers: string[] }>();

  if (!body.policyNumbers || !Array.isArray(body.policyNumbers) || body.policyNumbers.length === 0) {
    return c.json({ error: "policyNumbers array is required" }, 400);
  }

  const tenantId = getTenantId(c);

  try {
    const results = await Promise.all(
      body.policyNumbers.map(async (policyNumber: string) => {
        const policy = await findPolicyByNumber(tenantId, policyNumber);

        if (!policy || policy.status !== "active") {
          return {
            policyNumber,
            success: false,
            message: "POLICY_NOT_FOUND",
          };
        }

        const tokenPayload: PhoenixTokenPayload = {
          sub: policy.id,
          policyNumber: policy.policyNumber,
          insuredName: policy.insuredName,
          insuredEmail: policy.insuredEmail,
          insuredPhone: policy.insuredPhone,
          tenantId,
          userType: "policyholder",
          role: "policyholder",
          "https://hasura.io/jwt/claims": {
            "x-hasura-default-role": "policyholder",
            "x-hasura-allowed-roles": ["policyholder"],
            "x-hasura-user-id": policy.id,
            "x-hasura-tenant-id": tenantId,
          },
        };

        const token = await signPhoenixToken(tokenPayload);

        return {
          policyNumber,
          success: true,
          token,
          policy: {
            id: policy.id,
            policyNumber: policy.policyNumber,
            status: policy.status,
            insuredName: policy.insuredName,
            insuredEmail: policy.insuredEmail,
            insuredPhone: policy.insuredPhone,
            effectiveDate: policy.effectiveDate,
            expiryDate: policy.expiryDate,
          },
        };
      })
    );

    return c.json({ results });
  } catch (err) {
    console.error("[Phoenix] Error during login:", err);
    return c.json({ error: "Failed to process login" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ── Token refresh ─────────────────────────────────────────────────────────

phoenix.post("/phoenix/token/refresh", async (c) => {
  const payload = c.get("phoenix");

  try {
    const newToken = await signPhoenixToken(payload);
    return c.json({ token: newToken });
  } catch (err) {
    console.error("[Phoenix] Error refreshing token:", err);
    return c.json({ error: "Failed to refresh token" }, 500);
  }
});

// ── Claims ────────────────────────────────────────────────────────────────

phoenix.get("/phoenix/claims", async (c) => {
  const payload = c.get("phoenix");
  const policyId = payload.sub;
  const tenantId = payload.tenantId;

  try {
    const claims = await listClaimsForPolicy(tenantId, policyId);
    return c.json({ data: claims });
  } catch (err) {
    console.error("[Phoenix] Error listing claims:", err);
    return c.json({ error: "Failed to list claims" }, 500);
  }
});

phoenix.get("/phoenix/claims/:id", async (c) => {
  const payload = c.get("phoenix");
  const claimId = c.req.param("id");
  const policyId = payload.sub;
  const tenantId = payload.tenantId;

  try {
    const claim = await getClaimWithDetails(tenantId, claimId, policyId);
    if (!claim) {
      return c.json({ error: "Claim not found" }, 404);
    }
    return c.json(claim);
  } catch (err) {
    console.error("[Phoenix] Error fetching claim:", err);
    return c.json({ error: "Failed to fetch claim" }, 500);
  }
});

phoenix.post("/phoenix/claims", async (c) => {
  const payload = c.get("phoenix");
  const policyId = payload.sub;
  const tenantId = payload.tenantId;
  const body = await c.req.json<{
    claimantName: string;
    amountClaimed: number;
    currency: string;
    dateOfLoss?: string;
    dateOfService?: string;
    providerName?: string;
  }>();

  if (!body.claimantName || !body.amountClaimed || !body.currency) {
    return c.json({ error: "claimantName, amountClaimed, and currency are required" }, 400);
  }

  try {
    const claim = await createClaim(tenantId, policyId, body);
    return c.json(claim, 201);
  } catch (err) {
    console.error("[Phoenix] Error creating claim:", err);
    return c.json({ error: "Failed to create claim" }, 500);
  }
});

// ── Claim documents ───────────────────────────────────────────────────────

phoenix.post("/phoenix/claims/:id/documents", async (c) => {
  const payload = c.get("phoenix");
  const claimId = c.req.param("id");
  const tenantId = payload.tenantId;
  const body = await c.req.json<{
    fileName: string;
    fileType: string;
    documentType?: string;
  }>();

  if (!body.fileName || !body.fileType) {
    return c.json({ error: "fileName and fileType are required" }, 400);
  }

  try {
    const result = await createClaimDocument(tenantId, claimId, body);
    return c.json({ uploadUrl: result.uploadUrl, document: result.document });
  } catch (err) {
    console.error("[Phoenix] Error creating claim document:", err);
    return c.json({ error: "Failed to create claim document" }, 500);
  }
});

// ── OTP ───────────────────────────────────────────────────────────────────

phoenix.post("/phoenix/claims/:id/otp/request", async (c) => {
  const payload = c.get("phoenix");
  const tenantId = payload.tenantId;
  const email = payload.insuredEmail;

  if (!email) {
    return c.json({ error: "No email associated with this policy" }, 400);
  }

  try {
    const { code } = await createOtpRequest({
      tenantId,
      provider: "email_otp",
      destination: email,
    });

    await sendEmailOtp(email, code);

    return c.json({ success: true });
  } catch (err) {
    console.error("[Phoenix] Error requesting OTP:", err);
    return c.json({ error: "Failed to send OTP" }, 500);
  }
});

phoenix.post("/phoenix/claims/:id/otp/verify", async (c) => {
  const payload = c.get("phoenix");
  const tenantId = payload.tenantId;
  const email = payload.insuredEmail;
  const body = await c.req.json<{ code: string }>();

  if (!body.code) {
    return c.json({ error: "code is required" }, 400);
  }

  if (!email) {
    return c.json({ error: "No email associated with this policy" }, 400);
  }

  try {
    const result = await verifyOtp({
      tenantId,
      destination: email,
      code: body.code,
    });

    if (!result.valid) {
      return c.json({ error: "Invalid or expired OTP" }, 401);
    }

    return c.json({ success: true, verified: true });
  } catch (err) {
    console.error("[Phoenix] Error verifying OTP:", err);
    return c.json({ error: "Failed to verify OTP" }, 500);
  }
});

export default phoenix;
