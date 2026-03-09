import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";

// ---------------------------------------------------------------------------
// DDN endpoint — used by portal agents, policyRulesTool, compile-policy-rules
// This is the default Hasura endpoint (Banyan supergraph).
// ---------------------------------------------------------------------------
const DDN_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? "https://banyan.services.papaya.asia/graphql";

const DDN_AUTH_HEADERS: Record<string, string> = process.env.HASURA_ADMIN_TOKEN
  ? { Authorization: `Bearer ${process.env.HASURA_ADMIN_TOKEN}` }
  : {};

// ---------------------------------------------------------------------------
// Apple v2 endpoint — used by legacy agent tools for claim_cases, mutations, actions.
// Falls back to DDN endpoint if not set (backward compat for non-Apple workloads).
// ---------------------------------------------------------------------------
const APPLE_ENDPOINT = process.env.APPLE_GRAPHQL_ENDPOINT ?? DDN_ENDPOINT;

const APPLE_AUTH_HEADERS: Record<string, string> = process.env.APPLE_ADMIN_SECRET
  ? { "x-hasura-admin-secret": process.env.APPLE_ADMIN_SECRET }
  : process.env.HASURA_ADMIN_SECRET
    ? { "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET }
    : DDN_AUTH_HEADERS;

// ---------------------------------------------------------------------------
// Apollo Client — used by legacy agents (claim-assessor, overseer, drone, etc.)
// Connects to Apple v2 for claim_cases, insured_certificates, mutations, actions.
// ---------------------------------------------------------------------------

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    headers: APPLE_AUTH_HEADERS,
    uri: APPLE_ENDPOINT,
  }),
});

export function getClient() {
  return client;
}

// ---------------------------------------------------------------------------
// gqlQuery — fetch-based client for DDN (Banyan supergraph).
// Used by portal agents and any code querying Banyan-only models.
// ---------------------------------------------------------------------------

export async function gqlQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(DDN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...DDN_AUTH_HEADERS },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

// ---------------------------------------------------------------------------
// ddnQuery — explicit alias for gqlQuery. Used by policyRulesTool and
// compile-policy-rules to make the DDN target clear in code.
// ---------------------------------------------------------------------------

export const ddnQuery = gqlQuery;
