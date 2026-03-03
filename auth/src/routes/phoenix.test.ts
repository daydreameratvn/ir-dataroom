import { describe, it, expect, beforeAll, mock } from "bun:test";
import { Hono } from "hono";

// Mock phoenix service before importing routes
const mockFindPolicyByNumber = mock(() => Promise.resolve(null));
const mockListClaimsForPolicy = mock(() => Promise.resolve([]));
const mockGetClaimWithDetails = mock(() => Promise.resolve(null));
const mockCreateClaim = mock(() => Promise.resolve(null));
const mockCreateClaimDocument = mock(() =>
  Promise.resolve({ uploadUrl: "https://s3.example.com/upload", document: { id: "doc-1" } })
);

mock.module("../services/phoenix.ts", () => ({
  findPolicyByNumber: mockFindPolicyByNumber,
  listClaimsForPolicy: mockListClaimsForPolicy,
  getClaimWithDetails: mockGetClaimWithDetails,
  createClaim: mockCreateClaim,
  createClaimDocument: mockCreateClaimDocument,
}));

// Mock OTP service
mock.module("../services/otp.ts", () => ({
  createOtpRequest: mock(() => Promise.resolve({ code: "123456" })),
  verifyOtp: mock(() => Promise.resolve({ valid: true })),
  sendEmailOtp: mock(() => Promise.resolve()),
}));

import phoenix from "./phoenix.ts";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const MOCK_POLICY = {
  id: "9da70002-83bc-42c4-8bc6-979de4bfc722",
  policyNumber: "TCL-2024-000001",
  status: "active",
  insuredName: "Nguyễn Văn An",
  insuredEmail: "nguyen.an@example.com",
  insuredPhone: "+84901234567",
  effectiveDate: new Date("2024-01-01"),
  expiryDate: new Date("2025-01-01"),
  tenantId: TENANT_ID,
};

const MOCK_CLAIMS = [
  {
    id: "claim-1",
    claimNumber: "CLM-2024-001",
    status: "submitted",
    policyId: MOCK_POLICY.id,
    claimantName: "Nguyễn Văn An",
    providerName: "Bệnh viện Chợ Rẫy",
    amountClaimed: "15000000.00",
    currency: "VND",
  },
  {
    id: "claim-2",
    claimNumber: "CLM-2024-002",
    status: "approved",
    policyId: MOCK_POLICY.id,
    claimantName: "Nguyễn Văn An",
    providerName: "Phòng khám Đa khoa",
    amountClaimed: "5000000.00",
    currency: "VND",
  },
];

describe("Phoenix Routes", () => {
  let app: Hono;

  beforeAll(() => {
    process.env.JWT_SECRET_KEY = "test-jwt-secret-key-for-phoenix-testing";
    app = new Hono();
    app.route("/auth", phoenix);
  });

  // Helper to login and get a valid token
  async function getToken(policyNumber = "TCL-2024-000001"): Promise<string> {
    mockFindPolicyByNumber.mockResolvedValueOnce(MOCK_POLICY);

    const res = await app.fetch(
      new Request("http://localhost/auth/phoenix/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": TENANT_ID,
        },
        body: JSON.stringify({ policyNumbers: [policyNumber] }),
      })
    );

    const body = await res.json();
    return (body as any).results[0].token;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════════════════════════

  describe("POST /auth/phoenix/login", () => {
    it("returns JWT for valid policy number", async () => {
      mockFindPolicyByNumber.mockResolvedValueOnce(MOCK_POLICY);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
          body: JSON.stringify({ policyNumbers: ["TCL-2024-000001"] }),
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.results).toHaveLength(1);
      expect(body.results[0].success).toBe(true);
      expect(body.results[0].token).toBeTruthy();
      expect(body.results[0].policy.policyNumber).toBe("TCL-2024-000001");
      expect(body.results[0].policy.insuredName).toBe("Nguyễn Văn An");
    });

    it("returns POLICY_NOT_FOUND for unknown policy", async () => {
      mockFindPolicyByNumber.mockResolvedValueOnce(null);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
          body: JSON.stringify({ policyNumbers: ["FAKE-000"] }),
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.results[0].success).toBe(false);
      expect(body.results[0].message).toBe("POLICY_NOT_FOUND");
    });

    it("returns POLICY_NOT_FOUND for inactive policy", async () => {
      mockFindPolicyByNumber.mockResolvedValueOnce({ ...MOCK_POLICY, status: "expired" });

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
          body: JSON.stringify({ policyNumbers: ["TCL-2024-000001"] }),
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.results[0].success).toBe(false);
      expect(body.results[0].message).toBe("POLICY_NOT_FOUND");
    });

    it("handles multi-policy login with mixed results", async () => {
      mockFindPolicyByNumber
        .mockResolvedValueOnce(MOCK_POLICY)
        .mockResolvedValueOnce(null);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
          body: JSON.stringify({ policyNumbers: ["TCL-2024-000001", "FAKE-999"] }),
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.results).toHaveLength(2);
      expect(body.results[0].success).toBe(true);
      expect(body.results[1].success).toBe(false);
    });

    it("returns 400 for empty body", async () => {
      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain("policyNumbers");
    });

    it("returns 400 for empty policyNumbers array", async () => {
      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": TENANT_ID },
          body: JSON.stringify({ policyNumbers: [] }),
        })
      );

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH MIDDLEWARE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Authentication middleware", () => {
    it("returns 401 without authorization header", async () => {
      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims")
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error).toContain("authorization");
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims", {
          headers: { Authorization: "Bearer invalid-token-here" },
        })
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error).toContain("Invalid or expired");
    });

    it("returns 401 with non-Bearer auth scheme", async () => {
      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims", {
          headers: { Authorization: "Basic dXNlcjpwYXNz" },
        })
      );

      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN REFRESH
  // ═══════════════════════════════════════════════════════════════════════════

  describe("POST /auth/phoenix/token/refresh", () => {
    it("returns a new token", async () => {
      const token = await getToken();

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/token/refresh", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.token).toBeTruthy();
      // Token is a valid JWT string (header.payload.signature)
      expect(body.token.split(".")).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLAIMS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /auth/phoenix/claims", () => {
    it("returns claims for authenticated policyholder", async () => {
      const token = await getToken();
      mockListClaimsForPolicy.mockResolvedValueOnce(MOCK_CLAIMS);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims", {
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toHaveLength(2);
      expect(body.data[0].claimNumber).toBe("CLM-2024-001");
    });

    it("returns empty array when no claims exist", async () => {
      const token = await getToken();
      mockListClaimsForPolicy.mockResolvedValueOnce([]);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims", {
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.data).toHaveLength(0);
    });
  });

  describe("GET /auth/phoenix/claims/:id", () => {
    it("returns claim details", async () => {
      const token = await getToken();
      const claimDetail = { ...MOCK_CLAIMS[0], documents: [], notes: [] };
      mockGetClaimWithDetails.mockResolvedValueOnce(claimDetail);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims/claim-1", {
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.claimNumber).toBe("CLM-2024-001");
    });

    it("returns 404 for non-existent claim", async () => {
      const token = await getToken();
      mockGetClaimWithDetails.mockResolvedValueOnce(null);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims/fake-id", {
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error).toContain("not found");
    });
  });

  describe("POST /auth/phoenix/claims", () => {
    it("creates a new claim", async () => {
      const token = await getToken();
      const newClaim = {
        id: "claim-new",
        claimNumber: "CLM-2024-003",
        status: "submitted",
        claimantName: "Nguyễn Văn An",
        amountClaimed: "10000000.00",
        currency: "VND",
      };
      mockCreateClaim.mockResolvedValueOnce(newClaim);

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            claimantName: "Nguyễn Văn An",
            amountClaimed: 10000000,
            currency: "VND",
          }),
        })
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as any;
      expect(body.claimNumber).toBe("CLM-2024-003");
    });

    it("returns 400 when required fields are missing", async () => {
      const token = await getToken();

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ claimantName: "Test" }),
        })
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.error).toContain("required");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("POST /auth/phoenix/claims/:id/documents", () => {
    it("returns upload URL for document", async () => {
      const token = await getToken();

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims/claim-1/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ fileName: "receipt.pdf", fileType: "application/pdf" }),
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.uploadUrl).toBeTruthy();
      expect(body.document).toBeTruthy();
    });

    it("returns 400 when fileName is missing", async () => {
      const token = await getToken();

      const res = await app.fetch(
        new Request("http://localhost/auth/phoenix/claims/claim-1/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ fileType: "application/pdf" }),
        })
      );

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JWT TOKEN STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("JWT token payload", () => {
    it("contains correct claims structure", async () => {
      const token = await getToken();

      // Decode JWT payload (base64url)
      const [, payloadPart] = token.split(".");
      const payload = JSON.parse(
        Buffer.from(payloadPart!, "base64url").toString()
      );

      expect(payload.policyNumber).toBe("TCL-2024-000001");
      expect(payload.insuredName).toBe("Nguyễn Văn An");
      expect(payload.userType).toBe("policyholder");
      expect(payload.role).toBe("policyholder");
      expect(payload.sub).toBe(MOCK_POLICY.id);
      expect(payload.tenantId).toBe(TENANT_ID);

      // Hasura claims
      const hasuraClaims = payload["https://hasura.io/jwt/claims"];
      expect(hasuraClaims["x-hasura-default-role"]).toBe("policyholder");
      expect(hasuraClaims["x-hasura-allowed-roles"]).toEqual(["policyholder"]);
      expect(hasuraClaims["x-hasura-user-id"]).toBe(MOCK_POLICY.id);
      expect(hasuraClaims["x-hasura-tenant-id"]).toBe(TENANT_ID);

      // Expiration should be ~24h in the future
      expect(payload.exp).toBeGreaterThan(payload.iat);
      expect(payload.exp - payload.iat).toBe(86400); // 24h
    });
  });
});
