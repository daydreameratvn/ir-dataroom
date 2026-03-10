/**
 * Phoenix auth connector — proxies authentication operations to the auth service.
 *
 * All exported functions become GraphQL mutations (procedures) in DDN.
 * The auth service runs on ECS behind CloudFront at PHOENIX_AUTH_SERVICE_URL.
 */

const AUTH_URL = () => {
  const url = process.env.PHOENIX_AUTH_SERVICE_URL;
  if (!url) throw new Error("PHOENIX_AUTH_SERVICE_URL not set");
  return url.replace(/\/$/, "");
};

// ── Types ──

interface PolicyInfo {
  id: string;
  policyNumber: string;
  insuredName: string;
  status: string;
}

interface LoginResultItem {
  policyNumber: string;
  success: boolean;
  message: string | null;
  token: string | null;
  policy: PolicyInfo | null;
}

interface PhoenixLoginResponse {
  results: LoginResultItem[];
}

interface PhoenixRefreshTokenResponse {
  token: string;
}

interface PhoenixOtpResponse {
  success: boolean;
}

interface PhoenixVerifyOtpResponse {
  success: boolean;
  verified: boolean;
}

interface ClaimDocumentInfo {
  id: string;
  claimId: string;
  fileName: string;
  fileType: string | null;
  fileUrl: string | null;
  fileSizeBytes: number | null;
  documentType: string | null;
  createdAt: string;
}

interface PhoenixUploadDocumentResponse {
  uploadUrl: string;
  document: ClaimDocumentInfo;
}

// ── Helper ──

async function authRequest<T>(
  path: string,
  options: {
    method: string;
    body?: string;
    token?: string | null;
    tenantId?: string | null;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  if (options.tenantId) {
    headers["x-tenant-id"] = options.tenantId;
  }

  const response = await fetch(`${AUTH_URL()}${path}`, {
    method: options.method,
    headers,
    body: options.body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Auth service error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

// ── Procedures (GraphQL mutations) ──

/**
 * Authenticate policy holders by policy numbers.
 * Returns JWT tokens for each valid policy.
 */
export async function phoenixLogin(
  policyNumbers: string[],
): Promise<PhoenixLoginResponse> {
  return authRequest<PhoenixLoginResponse>("/auth/phoenix/login", {
    method: "POST",
    body: JSON.stringify({ policyNumbers }),
  });
}

/**
 * Refresh an expired Phoenix JWT token.
 * Requires a valid (or recently expired) token in the session.
 */
export async function phoenixRefreshToken(
  token: string,
): Promise<PhoenixRefreshTokenResponse> {
  return authRequest<PhoenixRefreshTokenResponse>(
    "/auth/phoenix/token/refresh",
    {
      method: "POST",
      token,
    },
  );
}

/**
 * Request an OTP code for claim verification.
 * Sends the code to the insured person's registered email/phone.
 */
export async function phoenixRequestOtp(
  claimId: string,
  token: string,
): Promise<PhoenixOtpResponse> {
  return authRequest<PhoenixOtpResponse>(
    `/auth/phoenix/claims/${claimId}/otp/request`,
    {
      method: "POST",
      token,
    },
  );
}

/**
 * Verify an OTP code for claim action authorization.
 */
export async function phoenixVerifyOtp(
  claimId: string,
  code: string,
  token: string,
): Promise<PhoenixVerifyOtpResponse> {
  return authRequest<PhoenixVerifyOtpResponse>(
    `/auth/phoenix/claims/${claimId}/otp/verify`,
    {
      method: "POST",
      body: JSON.stringify({ code }),
      token,
    },
  );
}

/**
 * Request a presigned S3 upload URL for a claim document.
 * Returns the upload URL and the created document record.
 */
export async function phoenixUploadDocument(
  claimId: string,
  fileName: string,
  fileType: string,
  documentType: string | null,
  token: string,
): Promise<PhoenixUploadDocumentResponse> {
  return authRequest<PhoenixUploadDocumentResponse>(
    `/auth/phoenix/claims/${claimId}/documents`,
    {
      method: "POST",
      body: JSON.stringify({ fileName, fileType, documentType }),
      token,
    },
  );
}
