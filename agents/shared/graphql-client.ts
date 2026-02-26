import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client/core";

const GRAPHQL_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT ?? "http://localhost:4000/graphql";

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new HttpLink({
    headers: {
      "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET ?? "",
    },
    uri: GRAPHQL_ENDPOINT,
  }),
});

export function getClient() {
  return client;
}
