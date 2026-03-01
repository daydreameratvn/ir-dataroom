import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import sso from "./sso.ts";

/**
 * Integration tests for SSO routes.
 * Verifies that the /auth/sso/microsoft route redirects to Microsoft's OAuth page.
 */

describe("SSO Routes", () => {
  let app: Hono;

  beforeAll(() => {
    // Set up a minimal Hono app with the SSO routes
    app = new Hono();
    // Set JWT_SECRET_KEY so state signing doesn't need AWS Secrets Manager
    process.env.JWT_SECRET_KEY = "test-jwt-secret-key-for-testing-only";
    app.route("/auth", sso);
  });

  describe("GET /auth/sso/microsoft", () => {
    it("redirects to Microsoft OAuth URL with correct parameters", async () => {
      const req = new Request(
        "http://localhost/auth/sso/microsoft?tenant_id=00000000-0000-0000-0000-000000000001&return_url=/dashboard",
        { redirect: "manual" }
      );

      const res = await app.fetch(req);

      // Should be a redirect (302)
      expect(res.status).toBe(302);

      const location = res.headers.get("Location");
      expect(location).toBeTruthy();

      const url = new URL(location!);
      expect(url.hostname).toBe("login.microsoftonline.com");
      expect(url.pathname).toContain("oauth2/v2.0/authorize");
      expect(url.searchParams.get("client_id")).toBe(
        "6273b61f-6da1-4948-bdd8-e3c016e9a214"
      );
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("scope")).toContain("User.Read");

      // State should be signed and contain our data
      const state = url.searchParams.get("state");
      expect(state).toBeTruthy();
      expect(state).toContain("."); // base64url.signature format
    });
  });

  describe("GET /auth/sso/:provider — unsupported", () => {
    it("returns 400 for unsupported provider", async () => {
      const req = new Request(
        "http://localhost/auth/sso/facebook?tenant_id=00000000-0000-0000-0000-000000000001"
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect((body as Record<string, string>).error).toContain("Unsupported provider");
    });
  });

  describe("GET /auth/callback/microsoft — missing params", () => {
    it("redirects to /login?error=missing_params when no code", async () => {
      const req = new Request(
        "http://localhost/auth/callback/microsoft",
        { redirect: "manual" }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(302);

      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=missing_params");
    });
  });

  describe("GET /auth/callback/microsoft — OAuth error", () => {
    it("redirects to /login with error when provider returns error", async () => {
      const req = new Request(
        "http://localhost/auth/callback/microsoft?error=access_denied",
        { redirect: "manual" }
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(302);

      const location = res.headers.get("Location");
      expect(location).toContain("/login?error=access_denied");
    });
  });
});
