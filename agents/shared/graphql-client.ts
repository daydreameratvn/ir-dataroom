import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";

// ---------------------------------------------------------------------------
// DDN endpoint — Banyan supergraph with sweetpotato (direct PostgreSQL).
// This is the primary endpoint for all new agent queries and mutations.
// ---------------------------------------------------------------------------
const DDN_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? "https://banyan.services.papaya.asia/graphql";

const DDN_AUTH_HEADERS: Record<string, string> = process.env.HASURA_ADMIN_TOKEN
  ? { Authorization: `Bearer ${process.env.HASURA_ADMIN_TOKEN}` }
  : {};

// ---------------------------------------------------------------------------
// Apple v2 endpoint — ONLY for custom actions that don't exist in DDN:
//   createOtpForAnyRecipient, submitClaimWithOtp, payout.getBankAccountInfo,
//   claimInsuredBenefitDetail, approveClaim, createUpdateClaimDetail
// ---------------------------------------------------------------------------
const APPLE_ENDPOINT = process.env.APPLE_GRAPHQL_ENDPOINT ?? DDN_ENDPOINT;

const APPLE_AUTH_HEADERS: Record<string, string> = process.env.APPLE_ADMIN_SECRET
  ? { "x-hasura-admin-secret": process.env.APPLE_ADMIN_SECRET }
  : process.env.HASURA_ADMIN_SECRET
    ? { "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET }
    : DDN_AUTH_HEADERS;

// ---------------------------------------------------------------------------
// gqlQuery — fetch-based client for DDN (Banyan supergraph / sweetpotato).
// Use this for all standard CRUD queries and mutations.
// ---------------------------------------------------------------------------

export async function gqlQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(DDN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...DDN_AUTH_HEADERS },
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
  const res = await fetch(APPLE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...APPLE_AUTH_HEADERS },
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

const apolloClient = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    headers: APPLE_AUTH_HEADERS,
    uri: APPLE_ENDPOINT,
  }),
});

/** @deprecated Use gqlQuery() for sweetpotato queries, appleQuery() for custom actions */
export function getClient() {
  return apolloClient;
}
