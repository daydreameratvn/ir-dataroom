import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";

const GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

// DDN Cloud uses Bearer JWT auth instead of x-hasura-admin-secret.
// HASURA_ADMIN_TOKEN is a pre-signed JWT stored in SSM /banyan/hasura/admin-token.
// Falls back to HASURA_ADMIN_SECRET for backward compatibility during migration.
if (!process.env.HASURA_ADMIN_TOKEN && !process.env.HASURA_ADMIN_SECRET) {
  throw new Error(
    "Missing auth: set HASURA_ADMIN_TOKEN (DDN Cloud JWT) or HASURA_ADMIN_SECRET (legacy).",
  );
}

const authHeader: Record<string, string> = process.env.HASURA_ADMIN_TOKEN
  ? { Authorization: `Bearer ${process.env.HASURA_ADMIN_TOKEN}` }
  : { "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET! };

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    headers: authHeader,
    uri: GRAPHQL_ENDPOINT,
  }),
});

export function getClient() {
  return client;
}
