import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";

// ---------------------------------------------------------------------------
// DDN endpoint — Banyan supergraph with sweetpotato (direct PostgreSQL).
// Source of truth: SSM /banyan/hasura/ddn-cloud-endpoint
// ---------------------------------------------------------------------------

function getDdnEndpoint(): string {
  const url = process.env.HASURA_GRAPHQL_ENDPOINT;
  if (!url) throw new Error("HASURA_GRAPHQL_ENDPOINT is required");
  return url;
}

function getDdnAuthHeaders(): Record<string, string> {
  const token = process.env.HASURA_ADMIN_TOKEN;
  if (!token) throw new Error("HASURA_ADMIN_TOKEN is required");
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// Apple v2 endpoint — ONLY for custom actions that don't exist in DDN:
//   createOtpForAnyRecipient, submitClaimWithOtp, payout.getBankAccountInfo,
//   claimInsuredBenefitDetail, approveClaim, createUpdateClaimDetail
// Source of truth: SSM /banyan/hasura/apple-endpoint
// ---------------------------------------------------------------------------

function getAppleEndpoint(): string {
  const url = process.env.APPLE_GRAPHQL_ENDPOINT;
  if (!url) throw new Error("APPLE_GRAPHQL_ENDPOINT is required");
  return url;
}

function getAppleAuthHeaders(): Record<string, string> {
  const secret = process.env.APPLE_ADMIN_SECRET;
  if (!secret) throw new Error("APPLE_ADMIN_SECRET is required");
  return { "x-hasura-admin-secret": secret };
}

// ---------------------------------------------------------------------------
// gqlQuery — fetch-based client for DDN (Banyan supergraph / sweetpotato).
// Use this for all standard CRUD queries and mutations.
// ---------------------------------------------------------------------------

export async function gqlQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(getDdnEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getDdnAuthHeaders() },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  return json.data as T;
}

// ---------------------------------------------------------------------------
// ddnQuery — explicit alias for gqlQuery.
// ---------------------------------------------------------------------------

export const ddnQuery = gqlQuery;

// ---------------------------------------------------------------------------
// appleQuery — fetch-based client for Apple v2 custom actions ONLY.
// Do NOT use this for standard CRUD — use gqlQuery instead.
// ---------------------------------------------------------------------------

export async function appleQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(getAppleEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAppleAuthHeaders() },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  return json.data as T;
}

// ---------------------------------------------------------------------------
// getClient — Apollo Client for Apple v2 (DEPRECATED).
// Kept for backward compatibility with agents not yet migrated to sweetpotato.
// New code should use gqlQuery() or appleQuery() instead.
// ---------------------------------------------------------------------------

let _apolloClient: ApolloClient<any> | null = null;

/** @deprecated Use gqlQuery() for sweetpotato queries, appleQuery() for custom actions */
export function getClient() {
  if (!_apolloClient) {
    _apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: new HttpLink({
        headers: getAppleAuthHeaders(),
        uri: getAppleEndpoint(),
      }),
    });
  }
  return _apolloClient;
}
