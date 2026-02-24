import { fetchSSMParams, requireParam } from "../lib/ssm.ts";

const params = await fetchSSMParams();
const engineUrl = requireParam(params, "engine-url");

const introspectionQuery = `{
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
  }
}`;

const response = await fetch(`${engineUrl}/graphql`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: introspectionQuery }),
});

if (!response.ok) {
  console.error(`Introspection failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const result = (await response.json()) as {
  errors?: unknown[];
  data: {
    __schema: {
      types: Array<{
        name: string;
        kind: string;
        fields?: Array<{
          name: string;
          type: { name: string; kind: string; ofType?: { name: string; kind: string } };
        }>;
      }>;
    };
  };
};

if (result.errors) {
  console.error("GraphQL errors:", JSON.stringify(result.errors, null, 2));
  process.exit(1);
}

const types = result.data.__schema.types.filter(
  (t: { name: string }) => !t.name.startsWith("__"),
);

console.log("Available types:\n");

for (const type of types) {
  if (type.fields) {
    console.log(`${type.name} (${type.kind})`);
    for (const field of type.fields) {
      const fieldType = field.type.ofType
        ? `${field.type.kind}<${field.type.ofType.name}>`
        : field.type.name;
      console.log(`  ${field.name}: ${fieldType}`);
    }
    console.log();
  }
}
