---
description: Backward compatibility reminder
---

# Backward Compatibility

All changes must be backward compatible for zero-downtime deployments.
Pattern: Add new alongside old -> controlled switchover -> remove old after verification.

Load the `backward-compatibility` skill when:
- Changing or removing a public API, GraphQL schema, or event contract
- Renaming, restructuring, or moving code that has existing callers
- Modifying database schema (columns, types, constraints)
- Updating shared packages that other workspaces depend on
- Introducing a feature flag or deprecation

Skip the `backward-compatibility` skill when:
- Adding brand-new code with no existing consumers
- Making internal refactors with no external API surface changes
- Fixing bugs that don't alter the public interface
