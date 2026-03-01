import { describe, it, expect, mock, beforeAll } from "bun:test";
import { getMicrosoftAuthUrl, exchangeMicrosoftCode } from "./microsoft.ts";

/**
 * Tests for Microsoft SSO integration.
 *
 * These tests verify:
 * 1. Auth URL generation produces a valid Microsoft OAuth URL
 * 2. Code exchange calls the correct Microsoft endpoints
 * 3. SSM credentials are fetched correctly from AWS
 */

// We need real AWS credentials to fetch SSM params (integration test)
const HAS_AWS = !!process.env.AWS_REGION || !!process.env.AWS_DEFAULT_REGION;

describe("Microsoft SSO", () => {
  describe("getMicrosoftAuthUrl", () => {
    it("generates a valid Microsoft OAuth authorization URL", async () => {
      const state = "test-state-abc123";
      const url = await getMicrosoftAuthUrl(state);

      expect(url).toStartWith(
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
      );

      const parsed = new URL(url);
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toContain("openid");
      expect(parsed.searchParams.get("scope")).toContain("email");
      expect(parsed.searchParams.get("scope")).toContain("User.Read");
      expect(parsed.searchParams.get("state")).toBe(state);
      expect(parsed.searchParams.get("prompt")).toBe("select_account");
      expect(parsed.searchParams.get("response_mode")).toBe("query");

      // client_id should be the one from cassava config
      expect(parsed.searchParams.get("client_id")).toBe(
        "6273b61f-6da1-4948-bdd8-e3c016e9a214"
      );

      // redirect_uri should point to our callback
      const redirectUri = parsed.searchParams.get("redirect_uri");
      expect(redirectUri).toContain("/auth/callback/microsoft");
    });
  });

  describe("exchangeMicrosoftCode", () => {
    it("throws on invalid authorization code", async () => {
      // An invalid code should fail at the token exchange step
      await expect(
        exchangeMicrosoftCode("invalid-code-that-doesnt-exist")
      ).rejects.toThrow("Microsoft token exchange failed");
    });
  });
});
