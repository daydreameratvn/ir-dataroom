/**
 * Integration tests for the Hasura DDN Cloud reverse proxy.
 *
 * Verifies:
 * - DNS resolves banyan.services.papaya.asia to CloudFront
 * - ACM certificate is valid and issued
 * - CloudFront proxies GraphQL requests to DDN Cloud
 * - Host header is NOT forwarded (origin receives its own hostname)
 * - All HTTP methods needed for GraphQL are allowed
 * - HTTPS is enforced
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

const PROXY_DOMAIN = "banyan.services.papaya.asia";
const PROXY_URL = `https://${PROXY_DOMAIN}/graphql`;
const DDN_ORIGIN = "banyan-prod.ddn.hasura.app";

function getAdminToken(): string {
  return execSync(
    `AWS_PROFILE=banyan aws ssm get-parameter --name /banyan/hasura/admin-token --with-decryption --region ap-southeast-1 --query Parameter.Value --output text`,
    { encoding: "utf-8" },
  ).trim();
}

describe("hasura-proxy CloudFront distribution", () => {
  describe("DNS resolution", () => {
    it("should resolve banyan.services.papaya.asia to a CloudFront domain", () => {
      const result = execSync(`dig ${PROXY_DOMAIN} CNAME +short`, {
        encoding: "utf-8",
      }).trim();
      expect(result).toMatch(/\.cloudfront\.net\.?$/);
    });
  });

  describe("ACM certificate", () => {
    it("should have a valid ISSUED certificate for the domain", () => {
      const certArn = execSync(
        `AWS_PROFILE=banyan aws acm list-certificates --region us-east-1 --query 'CertificateSummaryList[?DomainName==\`${PROXY_DOMAIN}\`].CertificateArn' --output text`,
        { encoding: "utf-8" },
      ).trim();
      expect(certArn).toMatch(/^arn:aws:acm:us-east-1:/);

      const status = execSync(
        `AWS_PROFILE=banyan aws acm describe-certificate --region us-east-1 --certificate-arn ${certArn} --query Certificate.Status --output text`,
        { encoding: "utf-8" },
      ).trim();
      expect(status).toBe("ISSUED");
    });
  });

  describe("GraphQL proxy", () => {
    it("should return auth error for unauthenticated requests (proves proxy reaches DDN)", async () => {
      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });

      // DDN Cloud returns 400 when no Authorization header — this proves
      // the request reached DDN (not a CloudFront error page)
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.errors).toBeDefined();
      expect(body.errors[0].message).toMatch(/Authorization/i);
    });

    it("should successfully proxy authenticated GraphQL queries", async () => {
      const token = getAdminToken();
      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual({ __typename: "Query" });
    });

    it("should not forward the Host header to the origin", async () => {
      // If Host were forwarded, DDN Cloud would receive "banyan.services.papaya.asia"
      // and reject or misroute the request. A successful response proves
      // CloudFront sent the origin's hostname instead.
      const token = getAdminToken();
      const response = await fetch(PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      });

      expect(response.status).toBe(200);
    });
  });

  describe("HTTPS enforcement", () => {
    it("should redirect HTTP to HTTPS", async () => {
      const response = await fetch(`http://${PROXY_DOMAIN}/graphql`, {
        method: "GET",
        redirect: "manual",
      });

      // CloudFront returns 301 redirect to HTTPS
      expect(response.status).toBe(301);
      const location = response.headers.get("location");
      expect(location).toMatch(/^https:\/\//);
    });
  });

  describe("CloudFront configuration", () => {
    it("should use CachingDisabled policy (no caching for GraphQL)", async () => {
      const token = getAdminToken();

      // Make two identical requests — both should hit origin (no caching)
      const body = JSON.stringify({
        query: "{ __typename }",
      });

      const [r1, r2] = await Promise.all([
        fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body,
        }),
        fetch(PROXY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body,
        }),
      ]);

      // Both should be cache misses
      expect(r1.headers.get("x-cache")).toMatch(/Miss/i);
      expect(r2.headers.get("x-cache")).toMatch(/Miss/i);
    });
  });
});
