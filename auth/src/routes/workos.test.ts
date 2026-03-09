import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the route module
// ---------------------------------------------------------------------------

const TEST_JWT_KEY = "test-jwt-secret-key-for-unit-tests";
const TEST_CLIENT_ID = "client_test_123";
const TEST_REDIRECT_URI = "http://localhost:4000/auth/workos/callback";

const mockAuthenticateWithCode = mock(() =>
  Promise.resolve({
    user: {
      id: "workos_user_001",
      email: "alice@papaya.asia",
      firstName: "Alice",
      lastName: "Nguyen",
      emailVerified: true,
    },
    organizationId: null,
    accessToken: "workos_access_token",
    refreshToken: "workos_refresh_token",
  }),
);

const mockGetAuthorizationUrl = mock(
  (opts: { clientId: string; redirectUri: string; provider: string; state: string }) =>
    `https://authkit.example.com/authorize?client_id=${opts.clientId}&state=${opts.state}`,
);

mock.module("../services/workos.ts", () => ({
  getWorkOSClient: () =>
    Promise.resolve({
      userManagement: {
        getAuthorizationUrl: mockGetAuthorizationUrl,
        authenticateWithCode: mockAuthenticateWithCode,
      },
    }),
  getWorkOSClientId: () => Promise.resolve(TEST_CLIENT_ID),
  getWorkOSRedirectUri: () => TEST_REDIRECT_URI,
}));

mock.module("../config.ts", () => ({
  getJwtKey: () => Promise.resolve(TEST_JWT_KEY),
  authConfig: {
    port: 4000,
    accessTokenExpiry: "1h",
    accessTokenTtlMs: 3600000,
    refreshTokenDays: 30,
    otpExpiry: 600000,
    otpMaxAttempts: 5,
    rpName: "Papaya",
    rpId: "papaya.asia",
    rpOrigin: "https://oasis.papaya.asia",
  },
}));

const mockFindUserByIdentity = mock(() => Promise.resolve(null));
const mockFindUserByEmail = mock(() => Promise.resolve(null));
const mockLinkIdentity = mock(() => Promise.resolve());
const mockUpdateLastLogin = mock(() => Promise.resolve());
const mockRecordLoginAttempt = mock(() => Promise.resolve());
const mockGetUserRoles = mock((user: { userLevel: string }) => ({
  role: user.userLevel,
  allowedRoles: [user.userLevel],
}));
const mockFindAutoJoinProvider = mock(() => Promise.resolve(null));
const mockAutoProvisionUser = mock(() => Promise.resolve(null));

mock.module("../services/user.ts", () => ({
  findUserByIdentity: mockFindUserByIdentity,
  findUserByEmail: mockFindUserByEmail,
  linkIdentity: mockLinkIdentity,
  updateLastLogin: mockUpdateLastLogin,
  recordLoginAttempt: mockRecordLoginAttempt,
  getUserRoles: mockGetUserRoles,
  findAutoJoinProvider: mockFindAutoJoinProvider,
  autoProvisionUser: mockAutoProvisionUser,
}));

const mockSignAccessToken = mock(() => Promise.resolve("mock_jwt_token"));

mock.module("../services/jwt.ts", () => ({
  signAccessToken: mockSignAccessToken,
  verifyAccessToken: mock(() => Promise.resolve(null)),
}));

const mockGenerateRefreshToken = mock(() => "mock_refresh_token");
const mockCreateSession = mock(() =>
  Promise.resolve({ id: "session_001", expiresAt: new Date() }),
);

mock.module("../services/session.ts", () => ({
  generateRefreshToken: mockGenerateRefreshToken,
  createSession: mockCreateSession,
}));

// Now import the route (after mocks are set up)
const { default: workosRoutes } = await import("./workos.ts");

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

function createApp() {
  const app = new Hono();
  app.route("/auth", workosRoutes);
  return app;
}

const TENANT_ID = "00000000-0000-0000-0000-000000000001";

const MOCK_USER = {
  id: "user_001",
  email: "alice@papaya.asia",
  name: "Alice Nguyen",
  tenantId: TENANT_ID,
  userType: "papaya",
  userLevel: "admin",
  phone: undefined,
  isImpersonatable: false,
  canImpersonate: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /auth/workos/login", () => {
  beforeEach(() => {
    mockGetAuthorizationUrl.mockClear();
  });

  test("redirects to WorkOS AuthKit with signed state", async () => {
    const app = createApp();
    const res = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/dashboard`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("https://authkit.example.com/authorize");
    expect(location).toContain(`client_id=${TEST_CLIENT_ID}`);

    // Verify getAuthorizationUrl was called with correct params
    expect(mockGetAuthorizationUrl).toHaveBeenCalledTimes(1);
    const callArgs = mockGetAuthorizationUrl.mock.calls[0]![0] as {
      clientId: string;
      redirectUri: string;
      provider: string;
      state: string;
    };
    expect(callArgs.clientId).toBe(TEST_CLIENT_ID);
    expect(callArgs.redirectUri).toBe(TEST_REDIRECT_URI);
    expect(callArgs.provider).toBe("authkit");
    expect(callArgs.state).toBeTruthy();
  });

  test("uses default returnUrl when not provided", async () => {
    const app = createApp();
    const res = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(mockGetAuthorizationUrl).toHaveBeenCalledTimes(1);
  });
});

describe("GET /auth/workos/callback", () => {
  beforeEach(() => {
    mockAuthenticateWithCode.mockClear();
    mockFindUserByIdentity.mockClear();
    mockFindUserByEmail.mockClear();
    mockLinkIdentity.mockClear();
    mockUpdateLastLogin.mockClear();
    mockRecordLoginAttempt.mockClear();
    mockSignAccessToken.mockClear();
    mockGenerateRefreshToken.mockClear();
    mockCreateSession.mockClear();
    mockFindAutoJoinProvider.mockClear();
    mockAutoProvisionUser.mockClear();
  });

  test("redirects to /login on error param", async () => {
    const app = createApp();
    const res = await app.request(
      "/auth/workos/callback?error=access_denied&error_description=User%20cancelled",
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "/login?error=User%20cancelled",
    );
  });

  test("redirects to /login when code is missing", async () => {
    const app = createApp();
    const res = await app.request("/auth/workos/callback", {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login?error=missing_code");
  });

  test("redirects to /login on invalid state signature", async () => {
    const app = createApp();
    const res = await app.request(
      "/auth/workos/callback?code=test_code&state=tampered.signature",
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login?error=invalid_state");
  });

  test("successful callback — existing user found by identity", async () => {
    mockFindUserByIdentity.mockResolvedValueOnce(MOCK_USER);

    const app = createApp();

    // First get a valid state by doing a login redirect
    const loginRes = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/dashboard`,
      { redirect: "manual" },
    );
    const loginLocation = loginRes.headers.get("Location")!;
    const stateMatch = loginLocation.match(/state=([^&]+)/);
    const state = stateMatch![1]!;

    // Now hit the callback with the valid state
    const res = await app.request(
      `/auth/workos/callback?code=valid_code&state=${state}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("Location")!;
    expect(location).toContain("/dashboard#access_token=mock_jwt_token");

    // Verify Set-Cookie for refresh token
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toContain("refresh_token=mock_refresh_token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");

    // Verify code exchange was called
    expect(mockAuthenticateWithCode).toHaveBeenCalledTimes(1);

    // Verify user lookup by identity
    expect(mockFindUserByIdentity).toHaveBeenCalledWith(
      TENANT_ID,
      "workos",
      "workos_user_001",
    );

    // Verify session was created
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockUpdateLastLogin).toHaveBeenCalledWith("user_001");

    // Verify login attempt was recorded
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: "user_001",
        provider: "workos",
        success: true,
      }),
    );
  });

  test("successful callback — user found by email, identity linked", async () => {
    mockFindUserByIdentity.mockResolvedValueOnce(null);
    mockFindUserByEmail.mockResolvedValueOnce(MOCK_USER);

    const app = createApp();
    const loginRes = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/`,
      { redirect: "manual" },
    );
    const state = loginRes.headers.get("Location")!.match(/state=([^&]+)/)![1]!;

    const res = await app.request(
      `/auth/workos/callback?code=valid_code&state=${state}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("#access_token=");

    // Verify identity was linked
    expect(mockLinkIdentity).toHaveBeenCalledWith(
      TENANT_ID,
      "user_001",
      "workos",
      "workos_user_001",
    );
  });

  test("redirects to /login when user not found and no auto-join", async () => {
    mockFindUserByIdentity.mockResolvedValueOnce(null);
    mockFindUserByEmail.mockResolvedValueOnce(null);
    mockFindAutoJoinProvider.mockResolvedValueOnce(null);

    const app = createApp();
    const loginRes = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/`,
      { redirect: "manual" },
    );
    const state = loginRes.headers.get("Location")!.match(/state=([^&]+)/)![1]!;

    const res = await app.request(
      `/auth/workos/callback?code=valid_code&state=${state}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login?error=user_not_found");

    // Verify failed login attempt was recorded
    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "workos",
        success: false,
        failureReason: "user_not_found",
      }),
    );
  });

  test("auto-provisions user when auto-join domain matches", async () => {
    const autoJoinProvider = {
      id: "provider_001",
      autoJoinUserType: "papaya",
      autoJoinUserLevel: "staff",
    };
    const provisionedUser = {
      ...MOCK_USER,
      id: "user_new",
      userLevel: "staff",
    };

    mockFindUserByIdentity.mockResolvedValueOnce(null);
    mockFindUserByEmail.mockResolvedValueOnce(null);
    mockFindAutoJoinProvider.mockResolvedValueOnce(autoJoinProvider);
    mockAutoProvisionUser.mockResolvedValueOnce(provisionedUser);

    const app = createApp();
    const loginRes = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/`,
      { redirect: "manual" },
    );
    const state = loginRes.headers.get("Location")!.match(/state=([^&]+)/)![1]!;

    const res = await app.request(
      `/auth/workos/callback?code=valid_code&state=${state}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("#access_token=");

    // Verify auto-provisioning
    expect(mockAutoProvisionUser).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        email: "alice@papaya.asia",
        name: "Alice Nguyen",
        userType: "papaya",
        userLevel: "staff",
        directoryProviderId: "provider_001",
      }),
    );

    // Verify identity was linked after provisioning
    expect(mockLinkIdentity).toHaveBeenCalledWith(
      TENANT_ID,
      "user_new",
      "workos",
      "workos_user_001",
    );
  });

  test("redirects to /login when code exchange fails", async () => {
    mockAuthenticateWithCode.mockRejectedValueOnce(new Error("Invalid code"));

    const app = createApp();
    const loginRes = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/`,
      { redirect: "manual" },
    );
    const state = loginRes.headers.get("Location")!.match(/state=([^&]+)/)![1]!;

    const res = await app.request(
      `/auth/workos/callback?code=bad_code&state=${state}`,
      { redirect: "manual" },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(
      "/login?error=authentication_failed",
    );

    expect(mockRecordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "workos",
        success: false,
        failureReason: "code_exchange_failed",
      }),
    );
  });

  test("builds user name from firstName + lastName", async () => {
    mockAuthenticateWithCode.mockResolvedValueOnce({
      user: {
        id: "workos_user_002",
        email: "bob@papaya.asia",
        firstName: "Bob",
        lastName: null,
        emailVerified: true,
      },
      organizationId: null,
    });
    mockFindUserByIdentity.mockResolvedValueOnce(null);
    mockFindUserByEmail.mockResolvedValueOnce(null);
    mockFindAutoJoinProvider.mockResolvedValueOnce({
      id: "prov_1",
      autoJoinUserType: "papaya",
      autoJoinUserLevel: "viewer",
    });
    mockAutoProvisionUser.mockResolvedValueOnce({
      ...MOCK_USER,
      id: "user_bob",
      name: "Bob",
    });

    const app = createApp();
    const loginRes = await app.request(
      `/auth/workos/login?tenant_id=${TENANT_ID}&return_url=/`,
      { redirect: "manual" },
    );
    const state = loginRes.headers.get("Location")!.match(/state=([^&]+)/)![1]!;

    await app.request(
      `/auth/workos/callback?code=valid_code&state=${state}`,
      { redirect: "manual" },
    );

    // Name should be just "Bob" since lastName is null
    expect(mockAutoProvisionUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bob" }),
    );
  });
});
