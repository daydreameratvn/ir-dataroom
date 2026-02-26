/**
 * Generate all HML metadata for the apple subgraph.
 *
 * Parses the DataConnectorLink schema and generates only the types
 * that are transitively referenced by commands (functions + procedures).
 *
 * Output files (in apple/metadata/):
 *   - apple_gql-types.hml   — ScalarType, DataConnectorScalarRepresentation,
 *                              ObjectType, TypePermissions
 *   - apple_gql_commands.hml — Command, CommandPermissions
 *
 * Usage:
 *   cd hasura/ddn && bun run ../scripts/gen-apple-commands.ts
 *
 * Then deploy:
 *   AWS_PROFILE=banyan bun run hasura:deploy
 */

import { parse, stringify } from "yaml";

const DDN_DIR = new URL("../ddn", import.meta.url).pathname;
const CONNECTOR_LINK = `${DDN_DIR}/apple/metadata/apple_gql.hml`;
const OUTPUT_DIR = `${DDN_DIR}/apple/metadata`;

// ---------------------------------------------------------------------------
// 1. Parse the DataConnectorLink schema
// ---------------------------------------------------------------------------

console.log("Parsing DataConnectorLink schema...");
const raw = await Bun.file(CONNECTOR_LINK).text();
const docs = raw.split(/^---$/m).filter((d) => d.trim());

let schema: any = null;
for (const doc of docs) {
  const parsed = parse(doc);
  if (parsed?.kind === "DataConnectorLink") {
    schema = parsed.definition.schema.schema;
    break;
  }
}

if (!schema) {
  console.error("Could not find DataConnectorLink schema in", CONNECTOR_LINK);
  process.exit(1);
}

const ndcScalars: Record<string, any> = schema.scalar_types ?? {};
const ndcObjects: Record<string, any> = schema.object_types ?? {};
const ndcFunctions: any[] = schema.functions ?? [];
const ndcProcedures: any[] = schema.procedures ?? [];

console.log(
  `  Scalars: ${Object.keys(ndcScalars).length}, ` +
    `Objects: ${Object.keys(ndcObjects).length}, ` +
    `Functions: ${ndcFunctions.length}, ` +
    `Procedures: ${ndcProcedures.length}`
);

// ---------------------------------------------------------------------------
// 2. Build scalar type mapping (NDC scalar name → supergraph scalar name)
// ---------------------------------------------------------------------------

const BUILTIN_SCALARS: Record<string, string> = {
  Boolean: "Boolean",
  Int: "Int",
  Float: "Float",
  String: "String",
};

const REPR_TO_SUPERGRAPH: Record<string, string> = {
  boolean: "Boolean",
  int32: "Int",
  float64: "Float",
  string: "String",
  json: "Json",
  timestamptz: "Timestamptz",
  biginteger: "Biginteger",
  enum: "Enum",
};

const customScalars = new Set<string>();
const scalarMapping = new Map<string, string>();

for (const [ndcName, ndcDef] of Object.entries(ndcScalars) as [string, any][]) {
  const reprType = ndcDef?.representation?.type;
  const supergraphName = REPR_TO_SUPERGRAPH[reprType] ?? "Json";
  scalarMapping.set(ndcName, supergraphName);
  if (!BUILTIN_SCALARS[supergraphName]) {
    customScalars.add(supergraphName);
  }
}

// ---------------------------------------------------------------------------
// 3. Collect all types transitively referenced by commands
// ---------------------------------------------------------------------------

console.log("Computing transitive type dependencies...");

/** Extract all named type references from an NDC type expression */
function collectNamedTypes(t: any, out: Set<string>): void {
  if (!t) return;
  if (t.type === "named") {
    out.add(t.name);
  } else if (t.type === "nullable") {
    collectNamedTypes(t.underlying_type, out);
  } else if (t.type === "array") {
    collectNamedTypes(t.element_type, out);
  }
}

// Seed: all types referenced by command arguments and result types
const referencedTypes = new Set<string>();

for (const fn of ndcFunctions) {
  collectNamedTypes(fn.result_type, referencedTypes);
  for (const [, argDef] of Object.entries(fn.arguments ?? {}) as [string, any][]) {
    collectNamedTypes(argDef.type, referencedTypes);
  }
}
for (const proc of ndcProcedures) {
  collectNamedTypes(proc.result_type, referencedTypes);
  for (const [, argDef] of Object.entries(proc.arguments ?? {}) as [string, any][]) {
    collectNamedTypes(argDef.type, referencedTypes);
  }
}

// Expand: transitively include all types referenced by object type fields
let changed = true;
while (changed) {
  changed = false;
  for (const typeName of referencedTypes) {
    if (ndcObjects[typeName]) {
      const fields = ndcObjects[typeName].fields ?? {};
      for (const [, fieldDef] of Object.entries(fields) as [string, any][]) {
        const before = referencedTypes.size;
        collectNamedTypes(fieldDef.type, referencedTypes);
        if (referencedTypes.size > before) changed = true;
      }
    }
  }
}

// Split into scalars, objects, and missing (undefined in NDC schema)
const usedScalars = new Set<string>();
const usedObjects = new Set<string>();
const missingTypes = new Set<string>();
for (const name of referencedTypes) {
  if (ndcScalars[name]) usedScalars.add(name);
  else if (ndcObjects[name]) usedObjects.add(name);
  else missingTypes.add(name);
}

if (missingTypes.size > 0) {
  console.log(`  Missing types (will map to Json): ${[...missingTypes].join(", ")}`);
}

console.log(`  Referenced scalars: ${usedScalars.size}, objects: ${usedObjects.size}`);

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

/** Resolve an NDC named type to its supergraph name */
function resolveName(ndcName: string): string {
  if (scalarMapping.has(ndcName)) return scalarMapping.get(ndcName)!;
  if (missingTypes.has(ndcName)) return "Json";
  return ndcName;
}

function resolveType(t: any): string {
  if (!t) return "Json";
  if (t.type === "named") return resolveName(t.name);
  if (t.type === "nullable") return resolveType(t.underlying_type);
  if (t.type === "array") return `[${resolveTypeNonNull(t.element_type)}]`;
  return "Json";
}

function resolveTypeNonNull(t: any): string {
  if (!t) return "Json!";
  if (t.type === "named") return `${resolveName(t.name)}!`;
  if (t.type === "nullable") return resolveType(t.underlying_type);
  if (t.type === "array") return `[${resolveTypeNonNull(t.element_type)}]!`;
  return "Json!";
}

function buildHmlType(t: any): string {
  if (!t) return "Json";
  if (t.type === "nullable") return resolveType(t.underlying_type);
  if (t.type === "named") return `${resolveName(t.name)}!`;
  if (t.type === "array") return `[${resolveTypeNonNull(t.element_type)}]!`;
  return "Json";
}

function toPascalCase(s: string): string {
  return s
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// ---------------------------------------------------------------------------
// 5. Generate ScalarType + DataConnectorScalarRepresentation
// ---------------------------------------------------------------------------

console.log("Generating scalar types...");

const scalarDocs: string[] = [];

// Custom supergraph scalar types (only those actually used)
const usedCustomScalars = new Set<string>();
for (const ndcName of usedScalars) {
  const sg = scalarMapping.get(ndcName);
  if (sg && !BUILTIN_SCALARS[sg]) usedCustomScalars.add(sg);
}

for (const name of usedCustomScalars) {
  scalarDocs.push(
    `---\n${stringify({
      kind: "ScalarType",
      version: "v1",
      definition: {
        name,
        graphql: { typeName: `${name}_apple` },
      },
    })}`
  );
}

let compExpCounter = 0;
for (const ndcName of usedScalars) {
  if (ndcName === "_HeaderMap") continue;
  const supergraphName = scalarMapping.get(ndcName)!;
  compExpCounter++;
  scalarDocs.push(
    `---\n${stringify({
      kind: "DataConnectorScalarRepresentation",
      version: "v1",
      definition: {
        dataConnectorName: "apple_gql",
        dataConnectorScalarType: ndcName,
        representation: supergraphName,
        graphql: {
          comparisonExpressionTypeName: `Apple_${ndcName}_comp_exp_${compExpCounter}`,
        },
      },
    })}`
  );
}

console.log(`  Generated ${scalarDocs.length} scalar documents`);

// ---------------------------------------------------------------------------
// 6. Generate ObjectType + TypePermissions
// ---------------------------------------------------------------------------

console.log("Generating object types...");

const objectDocs: string[] = [];

for (const ndcName of usedObjects) {
  const ndcDef = ndcObjects[ndcName];
  const fields = ndcDef?.fields ?? {};
  const fieldEntries = Object.entries(fields) as [string, any][];
  if (fieldEntries.length === 0) continue;

  const hmlFields: Array<{ name: string; type: string }> = [];

  for (const [fieldName, fieldDef] of fieldEntries) {
    hmlFields.push({ name: fieldName, type: buildHmlType(fieldDef.type) });
  }

  objectDocs.push(
    `---\n${stringify({
      kind: "ObjectType",
      version: "v1",
      definition: {
        name: ndcName,
        fields: hmlFields,
        graphql: {
          typeName: `Apple_${ndcName}`,
          inputTypeName: `Apple_${ndcName}_input`,
        },
        dataConnectorTypeMapping: [
          {
            dataConnectorName: "apple_gql",
            dataConnectorObjectType: ndcName,
          },
        ],
      },
    })}`
  );

  objectDocs.push(
    `---\n${stringify({
      kind: "TypePermissions",
      version: "v1",
      definition: {
        typeName: ndcName,
        permissions: [
          {
            role: "admin",
            output: {
              allowedFields: fieldEntries.map(([name]) => name),
            },
          },
        ],
      },
    })}`
  );
}

console.log(`  Generated ${objectDocs.length} object type documents`);

// ---------------------------------------------------------------------------
// 7. Generate Command + CommandPermissions
// ---------------------------------------------------------------------------

console.log("Generating commands...");

const commandDocs: string[] = [];

function generateCommand(
  name: string,
  pascalName: string,
  args: Record<string, any>,
  resultType: any,
  kind: "Query" | "Mutation",
  sourceKey: "function" | "procedure"
): string {
  const argEntries = Object.entries(args).filter(([k]) => k !== "_headers");
  const outputType = buildHmlType(resultType);

  const arguments_: Array<{ name: string; type: string }> = [];
  const argumentMapping: Record<string, string> = {};

  for (const [argName, argDef] of argEntries) {
    arguments_.push({ name: argName, type: buildHmlType(argDef.type) });
    argumentMapping[argName] = argName;
  }

  const cmdDoc: any = {
    kind: "Command",
    version: "v1",
    definition: {
      name: pascalName,
      outputType,
      source: {
        dataConnectorName: "apple_gql",
        dataConnectorCommand: { [sourceKey]: name },
        argumentMapping: Object.keys(argumentMapping).length > 0 ? argumentMapping : undefined,
      },
      graphql: {
        rootFieldName: `apple_${name}`,
        rootFieldKind: kind,
      },
      description: `${kind === "Query" ? "fetch" : "mutate"} ${name}`,
    },
  };

  if (arguments_.length > 0) {
    cmdDoc.definition.arguments = arguments_;
  }

  const permDoc: any = {
    kind: "CommandPermissions",
    version: "v1",
    definition: {
      commandName: pascalName,
      permissions: [{ role: "admin", allowExecution: true }],
    },
  };

  return `---\n${stringify(cmdDoc)}---\n${stringify(permDoc)}`;
}

// Detect name collisions between functions and procedures
const fnNames = new Set(ndcFunctions.map((fn: any) => toPascalCase(fn.name)));
const procNames = new Set(ndcProcedures.map((p: any) => toPascalCase(p.name)));
const collisions = new Set([...fnNames].filter((n) => procNames.has(n)));

if (collisions.size > 0) {
  console.log(`  Name collisions (fn vs proc): ${collisions.size} — suffixing mutations`);
}

// Also detect collisions within functions/procedures themselves
const usedCommandNames = new Set<string>();

for (const fn of ndcFunctions) {
  let pascal = toPascalCase(fn.name);
  if (usedCommandNames.has(pascal)) pascal = `${pascal}Query`;
  usedCommandNames.add(pascal);
  commandDocs.push(
    generateCommand(fn.name, pascal, fn.arguments ?? {}, fn.result_type, "Query", "function")
  );
}

for (const proc of ndcProcedures) {
  let pascal = toPascalCase(proc.name);
  if (usedCommandNames.has(pascal)) pascal = `${pascal}Mutation`;
  if (usedCommandNames.has(pascal)) pascal = `${pascal}_${proc.name}`;
  usedCommandNames.add(pascal);
  commandDocs.push(
    generateCommand(proc.name, pascal, proc.arguments ?? {}, proc.result_type, "Mutation", "procedure")
  );
}

console.log(`  Generated ${commandDocs.length} commands`);

// ---------------------------------------------------------------------------
// 8. Write output files
// ---------------------------------------------------------------------------

const typesPath = `${OUTPUT_DIR}/apple_gql-types.hml`;
const typesContent = [...scalarDocs, ...objectDocs].join("\n");
await Bun.write(typesPath, typesContent);

const commandsPath = `${OUTPUT_DIR}/apple_gql_commands.hml`;
const commandsContent = commandDocs.join("\n");
await Bun.write(commandsPath, commandsContent);

const typesSize = (new TextEncoder().encode(typesContent).length / 1024 / 1024).toFixed(1);
const cmdsSize = (new TextEncoder().encode(commandsContent).length / 1024 / 1024).toFixed(1);

console.log(`\nWritten:`);
console.log(`  ${typesPath} (${typesSize} MB)`);
console.log(`  ${commandsPath} (${cmdsSize} MB)`);
console.log(`\nNext: AWS_PROFILE=banyan bun run hasura:deploy`);
