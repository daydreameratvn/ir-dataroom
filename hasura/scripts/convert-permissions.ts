/**
 * Convert open_dd.json metadata to DDN Cloud HML (YAML) files.
 *
 * Reads hasura/metadata/open_dd.json and writes individual HML files to
 * hasura/ddn/app/metadata/ grouped by kind:
 *   - scalar-types.hml           (ScalarType + DataConnectorScalarRepresentation)
 *   - data-connector-link.hml    (DataConnectorLink)
 *   - <type-name>.hml            (ObjectType + Model + ModelPermissions + TypePermissions + Relationships per type)
 *
 * Usage: bun run hasura/scripts/convert-permissions.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const METADATA_PATH = join(import.meta.dir, "../metadata/open_dd.json");
const OUTPUT_DIR = join(import.meta.dir, "../ddn/app/metadata");

// ============================================================
// YAML serialiser (minimal, no deps)
// ============================================================

function needsQuoting(s: string): boolean {
  return (
    s === "" ||
    s === "true" ||
    s === "false" ||
    s === "null" ||
    s.includes(": ") ||
    s.includes("#") ||
    s.includes("\n") ||
    s.includes("'") ||
    s.startsWith("*") ||
    s.startsWith("&") ||
    s.startsWith("!") ||
    s.startsWith("{") ||
    s.startsWith("[") ||
    s.startsWith('"') ||
    s.startsWith("- ") ||
    /^\d+(\.\d+)?$/.test(s)
  );
}

function yamlScalar(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return needsQuoting(val) ? JSON.stringify(val) : val;
  return String(val);
}

function isScalar(val: unknown): boolean {
  return val === null || val === undefined || typeof val !== "object";
}

function isSimpleArray(val: unknown): boolean {
  if (!Array.isArray(val)) return false;
  return val.every((item) => isScalar(item));
}

function toYaml(obj: unknown, indent: number): string {
  const pad = "  ".repeat(indent);

  if (isScalar(obj)) return yamlScalar(obj);

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";

    // Simple scalar arrays → inline
    if (isSimpleArray(obj)) {
      const items = obj.map((item) => yamlScalar(item));
      const inline = `[${items.join(", ")}]`;
      if (inline.length < 100) return inline;
    }

    const lines: string[] = [];
    for (const item of obj) {
      if (isScalar(item)) {
        lines.push(`${pad}- ${yamlScalar(item)}`);
      } else if (Array.isArray(item)) {
        const nested = toYaml(item, indent + 2);
        lines.push(`${pad}-\n${nested}`);
      } else {
        // Object item: first key on same line as -, rest indented
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length === 0) {
          lines.push(`${pad}- {}`);
          continue;
        }
        const innerPad = `${pad}  `;
        const entryLines: string[] = [];
        for (const [k, v] of entries) {
          if (isScalar(v)) {
            entryLines.push(`${k}: ${yamlScalar(v)}`);
          } else if (isSimpleArray(v)) {
            const items = (v as unknown[]).map((item) => yamlScalar(item));
            const inline = `[${items.join(", ")}]`;
            if (inline.length < 100) {
              entryLines.push(`${k}: ${inline}`);
            } else {
              entryLines.push(`${k}:`);
              for (const item of v as unknown[]) {
                entryLines.push(`  - ${yamlScalar(item)}`);
              }
            }
          } else {
            const nested = toYaml(v, indent + 2);
            entryLines.push(`${k}:\n${nested}`);
          }
        }
        // First entry on the `- ` line
        lines.push(`${pad}- ${entryLines[0]}`);
        for (let i = 1; i < entryLines.length; i++) {
          // Subsequent entries need inner padding, adjusting for multiline
          const line = entryLines[i]!;
          lines.push(`${innerPad}${line}`);
        }
      }
    }
    return lines.join("\n");
  }

  // Object
  if (typeof obj === "object" && obj !== null) {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";

    const lines: string[] = [];
    for (const [k, v] of entries) {
      if (isScalar(v)) {
        lines.push(`${pad}${k}: ${yamlScalar(v)}`);
      } else if (isSimpleArray(v)) {
        const items = (v as unknown[]).map((item) => yamlScalar(item));
        const inline = `[${items.join(", ")}]`;
        if (inline.length < 100) {
          lines.push(`${pad}${k}: ${inline}`);
        } else {
          lines.push(`${pad}${k}:`);
          for (const item of v as unknown[]) {
            lines.push(`${pad}  - ${yamlScalar(item)}`);
          }
        }
      } else {
        const nested = toYaml(v, indent + 1);
        lines.push(`${pad}${k}:\n${nested}`);
      }
    }
    return lines.join("\n");
  }

  return String(obj);
}

function toHmlDocument(entry: Record<string, unknown>): string {
  return `---\n${toYaml(entry, 0)}\n`;
}

// ============================================================
// Main
// ============================================================

const raw = await Bun.file(METADATA_PATH).text();
const data: Array<Record<string, unknown>> = JSON.parse(raw);

mkdirSync(OUTPUT_DIR, { recursive: true });

// Group entries by kind
const byKind = new Map<string, Array<Record<string, unknown>>>();
for (const entry of data) {
  const kind = entry.kind as string;
  if (!byKind.has(kind)) byKind.set(kind, []);
  byKind.get(kind)!.push(entry);
}

// Group relationships by sourceType
const relationships = (byKind.get("Relationship") || []) as Array<{
  kind: string;
  version: string;
  definition: { sourceType: string; [k: string]: unknown };
}>;
const relsByType = new Map<string, typeof relationships>();
for (const rel of relationships) {
  const src = rel.definition.sourceType;
  if (!relsByType.has(src)) relsByType.set(src, []);
  relsByType.get(src)!.push(rel);
}

// Group model permissions by modelName
const modelPermissions = byKind.get("ModelPermissions") || [];
const modelPermsByModel = new Map<string, Record<string, unknown>>();
for (const perm of modelPermissions) {
  const def = perm.definition as { modelName: string };
  modelPermsByModel.set(def.modelName, perm);
}

// Group type permissions by typeName
const typePermissions = byKind.get("TypePermissions") || [];
const typePermsByType = new Map<string, Record<string, unknown>>();
for (const perm of typePermissions) {
  const def = perm.definition as { typeName: string };
  typePermsByType.set(def.typeName, perm);
}

// Map model name → objectType name
const models = byKind.get("Model") || [];
const modelsByObjectType = new Map<string, Record<string, unknown>>();
const objectTypeToModelName = new Map<string, string>();
for (const model of models) {
  const def = model.definition as { name: string; objectType: string };
  modelsByObjectType.set(def.objectType, model);
  objectTypeToModelName.set(def.objectType, def.name);
}

// 1. Write DataConnectorLink
const dcl = byKind.get("DataConnectorLink")?.[0];
if (dcl) {
  writeFileSync(join(OUTPUT_DIR, "data-connector-link.hml"), toHmlDocument(dcl));
  console.log("✓ data-connector-link.hml");
}

// 2. Write scalar types + representations in one file
const scalarTypes = byKind.get("ScalarType") || [];
const scalarReps = byKind.get("DataConnectorScalarRepresentation") || [];
const scalarContent = [...scalarTypes, ...scalarReps].map(toHmlDocument).join("");
writeFileSync(join(OUTPUT_DIR, "scalar-types.hml"), scalarContent);
console.log(`✓ scalar-types.hml (${scalarTypes.length} types, ${scalarReps.length} representations)`);

// 3. Write per-type files (ObjectType + Model + Permissions + Relationships)
const objectTypes = byKind.get("ObjectType") || [];
let fileCount = 0;

for (const objType of objectTypes) {
  const typeName = (objType.definition as { name: string }).name;
  const modelName = objectTypeToModelName.get(typeName);

  const documents: string[] = [];

  // ObjectType
  documents.push(toHmlDocument(objType));

  // Model (if exists)
  const model = modelsByObjectType.get(typeName);
  if (model) {
    documents.push(toHmlDocument(model));
  }

  // ModelPermissions
  if (modelName) {
    const modelPerm = modelPermsByModel.get(modelName);
    if (modelPerm) {
      documents.push(toHmlDocument(modelPerm));
    }
  }

  // TypePermissions
  const typePerm = typePermsByType.get(typeName);
  if (typePerm) {
    documents.push(toHmlDocument(typePerm));
  }

  // Relationships
  const rels = relsByType.get(typeName) || [];
  for (const rel of rels) {
    documents.push(toHmlDocument(rel));
  }

  // Write file — kebab-case filename from PascalCase type name
  const fileName = typeName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

  writeFileSync(join(OUTPUT_DIR, `${fileName}.hml`), documents.join(""));
  fileCount++;
}

console.log(`✓ ${fileCount} type files written`);
console.log(`\nTotal: ${fileCount + 2} HML files in ${OUTPUT_DIR}`);

// Summary
console.log("\nMetadata summary:");
console.log(`  DataConnectorLink: 1`);
console.log(`  ScalarTypes: ${scalarTypes.length}`);
console.log(`  DataConnectorScalarRepresentation: ${scalarReps.length}`);
console.log(`  ObjectTypes: ${objectTypes.length}`);
console.log(`  Models: ${models.length}`);
console.log(`  ModelPermissions: ${modelPermissions.length}`);
console.log(`  TypePermissions: ${typePermissions.length}`);
console.log(`  Relationships: ${relationships.length}`);
