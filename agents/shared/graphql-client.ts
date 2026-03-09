import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";

const GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? "https://banyan.services.papaya.asia/graphql";

// DDN Cloud uses Bearer JWT auth instead of x-hasura-admin-secret.
// HASURA_ADMIN_TOKEN is a pre-signed JWT stored in SSM /banyan/hasura/admin-token.
// Falls back to HASURA_ADMIN_SECRET for backward compatibility during migration.
const AUTH_HEADERS: Record<string, string> = process.env.HASURA_ADMIN_TOKEN
  ? { Authorization: `Bearer ${process.env.HASURA_ADMIN_TOKEN}` }
  : process.env.HASURA_ADMIN_SECRET
    ? { "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET }
    : {};

// ---------------------------------------------------------------------------
// Apollo Client — used by legacy agents (claim-assessor, overseer, drone, etc.)
// ---------------------------------------------------------------------------

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    headers: AUTH_HEADERS,
    uri: GRAPHQL_ENDPOINT,
  }),
});

export function getClient() {
  return client;
}

// ---------------------------------------------------------------------------
// Simple fetch-based GraphQL client — used by portal agents.
// Avoids Apollo's type system to prevent DDN v3 scalar mismatches (String vs String_1).
// ---------------------------------------------------------------------------

export async function gqlQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH_HEADERS },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}
