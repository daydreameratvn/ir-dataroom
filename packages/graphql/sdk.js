import { gql } from "@apollo/client/core";

/**
 * Shim for @papaya/graphql/sdk — wraps gql with fragment support.
 * graphql(queryString, [fragment1, fragment2, ...]) merges fragment DocumentNodes.
 */
export function graphql(source, fragments) {
  const doc = gql(source);
  if (fragments && Array.isArray(fragments)) {
    // Merge fragment definitions into the document
    for (const frag of fragments) {
      if (frag && frag.definitions) {
        for (const def of frag.definitions) {
          if (def.kind === "FragmentDefinition") {
            // Avoid duplicate fragment definitions
            const exists = doc.definitions.some(
              (d) => d.kind === "FragmentDefinition" && d.name.value === def.name.value
            );
            if (!exists) {
              doc.definitions.push(def);
            }
          }
        }
      }
    }
  }
  return doc;
}
