# SDKs — Partner Integration Libraries

## Overview

Partner-facing SDKs that allow third-party insurers and platforms to integrate with Papaya's APIs. Each platform directory can hold multiple named SDKs. The `sample` SDK in each platform serves as a template for creating new SDKs.

## Folder Structure

```
sdks/
├── CLAUDE.md
├── package.json            # Bun workspace root: ["node/*", "react/*", "react-native/*"]
│
├── node/                   # Node.js SDKs (core clients, zero browser deps)
│   └── sample/             # Template — copy this to create a new Node SDK
│       ├── package.json    # @papaya/sample
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── client.ts
│           └── types.ts
│
├── react/                  # React SDKs (hooks + providers, wraps a node SDK)
│   └── sample/             # Template — wraps @papaya/sample
│       ├── package.json    # @papaya/sample-react
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── provider.tsx
│           └── hooks/
│
├── react-native/           # React Native SDKs (RN-specific providers)
│   └── sample/             # Template — wraps @papaya/sample
│       ├── package.json    # @papaya/sample-react-native
│       ├── tsconfig.json
│       └── src/
│
├── ios/                    # iOS SDKs (Swift Packages, standalone)
│   └── sample/             # Template
│       ├── Package.swift
│       └── Sources/PapayaSDK/
│
└── android/                # Android SDKs (Kotlin/Gradle, standalone)
    └── sample/             # Template
        ├── build.gradle.kts
        └── src/main/kotlin/ai/papaya/sdk/
```

## Architecture

### Dependency Chain (TypeScript SDKs)

Each SDK set follows this pattern:

```
node/<name>  (core client, zero deps)
  ├── react/<name>          (adds React hooks + context)
  └── react-native/<name>   (adds RN-specific provider)
```

The node SDK is the foundation. It contains the HTTP client and types. The react and react-native SDKs wrap it with framework-specific patterns (context providers, hooks).

### Naming Convention

- Node SDK: `@papaya/<name>` — published to npm
- React SDK: `@papaya/<name>-react` — depends on `@papaya/<name>` via `workspace:*`
- React Native SDK: `@papaya/<name>-react-native` — depends on `@papaya/<name>` via `workspace:*`
- iOS SDK: `Papaya<Name>SDK` — Swift Package (standalone)
- Android SDK: `<name>-sdk-android` — Kotlin/Gradle (standalone)

### Native SDKs (iOS/Android)

The Swift and Kotlin SDKs are standalone — they do NOT depend on the TypeScript packages. They implement the same API surface directly using native HTTP clients (URLSession / Ktor). Keep API surface consistent across all SDKs for a given product.

### Development Setup

Source files are used for workspace resolution during development. The `publishConfig` field in each package.json overrides `main`/`types`/`exports` to point to `dist/` when publishing to npm.

## Creating a New SDK

1. Copy the `sample` directory under the target platform: `cp -r node/sample node/<new-name>`
2. Update `package.json`: change `name`, `description`
3. If creating react/react-native variants, copy those too and update the dependency from `@papaya/sample` to `@papaya/<new-name>`
4. Run `bun install` from `sdks/` to link everything
5. For iOS/Android: copy `ios/sample` or `android/sample` and update package/module names

## Development Rules

### API Surface

- All SDKs for a given product must expose the same operations across platforms
- Method names should feel idiomatic to the platform (camelCase for TS, etc.)
- Error handling must be consistent: typed errors with status codes and messages
- All responses must be fully typed — no `any` or untyped JSON

### Versioning

- TypeScript SDKs within the same product share a version number (released together)
- iOS and Android SDKs version independently but maintain API compatibility
- Follow semver strictly — breaking changes require a major version bump
- The REST API version (`/v1`, `/v2`) and SDK version are independent

### Testing

- Unit tests for every public method
- Integration tests against a mock API server
- Test both success and error paths
- TypeScript SDKs: Vitest
- iOS: XCTest
- Android: JUnit + MockK

### Publishing

- TypeScript SDKs publish to npm under `@papaya/` scope
- iOS SDK publishes as a Swift Package (Git tag-based)
- Android SDK publishes to Maven Central
- Always publish from CI — never from a local machine

### Backward Compatibility

- Never remove public API methods without a deprecation period
- Add new optional parameters with defaults — never change required parameters
- New response fields are additive only — never remove fields from response types
- Follow the root `CLAUDE.md` backward compatibility workflow

## Work Scope

When working in this folder, only reference:
- Files within `sdks/`
- Root `tsconfig.json` if relevant

Do not read or modify files in `platform/`, `mobile/`, `agents/`, `hasura/`, or `rootstock/`.
