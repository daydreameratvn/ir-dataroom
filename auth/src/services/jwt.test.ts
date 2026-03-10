import { describe, it, expect, beforeAll, mock } from "bun:test";
import { generateKeyPair, exportSPKI, importPKCS8, SignJWT } from "jose";

// Generate test keys before any imports that cache them
let rsaPublicKeyPem: string;
let rsaPrivateKey: CryptoKey;
const HS256_SECRET = "test-hs256-secret-key-for-jwt-signing";

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS512");
  rsaPublicKeyPem = await exportSPKI(publicKey);
  rsaPrivateKey = privateKey;

  // Set env vars before module loads
  process.env.JWT_SECRET_KEY = HS256_SECRET;
  process.env.BERRY_JWT_PUBLIC_KEY = rsaPublicKeyPem;
});

// Lazy import so env vars are set first
async function getJwtModule() {
  // Clear module cache to pick up env vars
  const mod = await import("./jwt.ts");
  return mod;
}

async function createBanyanToken(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode(HS256_SECRET);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub as string ?? "user-123")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

async function createBerryToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS512", typ: "JWT" })
    .setSubject(claims.sub as string ?? "berry-user-456")
    .setIssuer("papaya.asia")
    .setAudience("papaya.asia")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(rsaPrivateKey);
}

describe("verifyAccessToken", () => {
  describe("Banyan HS256 tokens", () => {
    it("should verify a valid Banyan token", async () => {
      const { verifyAccessToken } = await getJwtModule();

      const token = await createBanyanToken({
        sub: "user-123",
        email: "test@example.com",
        name: "Test User",
        userType: "staff",
        "https://hasura.io/jwt/claims": {
          "x-hasura-default-role": "admin",
          "x-hasura-allowed-roles": ["admin", "viewer"],
          "x-hasura-user-id": "user-123",
          "x-hasura-tenant-id": "tenant-abc",
        },
      });

      const payload = await verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-123");
      expect(payload!.email).toBe("test@example.com");
      expect(payload!.name).toBe("Test User");
      expect(payload!.tenantId).toBe("tenant-abc");
      expect(payload!.role).toBe("admin");
      expect(payload!.allowedRoles).toEqual(["admin", "viewer"]);
      expect(payload!.userType).toBe("staff");
    });

    it("should include impersonator fields when present", async () => {
      const { verifyAccessToken } = await getJwtModule();

      const token = await createBanyanToken({
        sub: "user-123",
        email: "admin@example.com",
        name: "Admin",
        userType: "admin",
        impersonatorId: "real-admin-id",
        canImpersonate: true,
        "https://hasura.io/jwt/claims": {
          "x-hasura-default-role": "admin",
          "x-hasura-allowed-roles": ["admin"],
          "x-hasura-user-id": "user-123",
          "x-hasura-tenant-id": "tenant-abc",
        },
      });

      const payload = await verifyAccessToken(token);
      expect(payload!.impersonatorId).toBe("real-admin-id");
      expect(payload!.canImpersonate).toBe(true);
    });
  });

  describe("Berry RS512 tokens", () => {
    it("should verify a valid Berry token with hasura.claims namespace", async () => {
      const { verifyAccessToken } = await getJwtModule();

      const token = await createBerryToken({
        sub: "berry-user-456",
        "hasura.claims": {
          "x-hasura-default-role": "staff",
          "x-hasura-allowed-roles": ["staff", "viewer"],
          "x-hasura-user-id": "berry-user-456",
          "x-hasura-tenant-id": "tenant-xyz",
        },
      });

      const payload = await verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("berry-user-456");
      expect(payload!.tenantId).toBe("tenant-xyz");
      expect(payload!.role).toBe("staff");
      expect(payload!.allowedRoles).toEqual(["staff", "viewer"]);
      expect(payload!.userType).toBe("berry");
    });

    it("should default missing fields for Berry tokens", async () => {
      const { verifyAccessToken } = await getJwtModule();

      const token = await createBerryToken({
        sub: "berry-user-789",
        "hasura.claims": {
          "x-hasura-default-role": "viewer",
          "x-hasura-allowed-roles": ["viewer"],
          "x-hasura-user-id": "berry-user-789",
          "x-hasura-tenant-id": "tenant-abc",
        },
      });

      const payload = await verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.email).toBe("");
      expect(payload!.name).toBe("");
      expect(payload!.userType).toBe("berry");
    });
  });

  describe("invalid tokens", () => {
    it("should return null for a garbage token", async () => {
      const { verifyAccessToken } = await getJwtModule();
      const payload = await verifyAccessToken("not.a.valid.token");
      expect(payload).toBeNull();
    });

    it("should return null for an expired Banyan token", async () => {
      const { verifyAccessToken } = await getJwtModule();
      const secret = new TextEncoder().encode(HS256_SECRET);
      const token = await new SignJWT({
        "https://hasura.io/jwt/claims": {
          "x-hasura-default-role": "admin",
          "x-hasura-allowed-roles": ["admin"],
          "x-hasura-user-id": "user-123",
          "x-hasura-tenant-id": "tenant-abc",
        },
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject("user-123")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(secret);

      const payload = await verifyAccessToken(token);
      expect(payload).toBeNull();
    });

    it("should return null for a Berry token with wrong issuer", async () => {
      const { verifyAccessToken } = await getJwtModule();
      const token = await new SignJWT({
        sub: "berry-user-456",
        "hasura.claims": {
          "x-hasura-default-role": "staff",
          "x-hasura-allowed-roles": ["staff"],
          "x-hasura-user-id": "berry-user-456",
          "x-hasura-tenant-id": "tenant-abc",
        },
      })
        .setProtectedHeader({ alg: "RS512", typ: "JWT" })
        .setSubject("berry-user-456")
        .setIssuer("wrong-issuer")
        .setAudience("papaya.asia")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(rsaPrivateKey);

      const payload = await verifyAccessToken(token);
      expect(payload).toBeNull();
    });
  });

  describe("signAccessToken", () => {
    it("should create a token that verifies as Banyan", async () => {
      const { signAccessToken, verifyAccessToken } = await getJwtModule();

      const token = await signAccessToken({
        sub: "user-999",
        email: "roundtrip@example.com",
        name: "Round Trip",
        tenantId: "tenant-rt",
        userType: "manager",
        role: "manager",
        allowedRoles: ["manager", "staff", "viewer"],
      });

      const payload = await verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user-999");
      expect(payload!.email).toBe("roundtrip@example.com");
      expect(payload!.role).toBe("manager");
      expect(payload!.tenantId).toBe("tenant-rt");
    });
  });
});
