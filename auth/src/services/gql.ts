const HASURA_ENDPOINT =
  process.env.BANYAN_DDN_ENDPOINT ?? process.env.HASURA_GRAPHQL_ENDPOINT ?? "https://banyan.services.papaya.asia/graphql";

const HASURA_AUTH: Record<string, string> = process.env.HASURA_ADMIN_TOKEN
  ? { Authorization: `Bearer ${process.env.HASURA_ADMIN_TOKEN}` }
  : process.env.HASURA_ADMIN_SECRET
    ? { "x-hasura-admin-secret": process.env.HASURA_ADMIN_SECRET }
    : {};

export async function gqlQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(HASURA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...HASURA_AUTH },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0]!.message);
  return json.data as T;
}
