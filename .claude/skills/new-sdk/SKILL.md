---
name: new-sdk
description: |
  Create a new partner SDK across platforms (Node, React, React Native, iOS, Android).
  Copies sample templates and configures naming, dependencies, and workspace linking.
---

# New SDK Scaffold

## Steps

1. **Copy the Node SDK template**
   ```bash
   cp -r sdks/node/sample sdks/node/<new-name>
   ```
   - Update `package.json`: change `name` to `@papaya/<new-name>`, update `description`

2. **Copy React SDK template (if needed)**
   ```bash
   cp -r sdks/react/sample sdks/react/<new-name>
   ```
   - Update `package.json`: change `name` to `@papaya/<new-name>-react`
   - Update the dependency from `@papaya/sample` to `@papaya/<new-name>` (keep `workspace:*`)

3. **Copy React Native SDK template (if needed)**
   ```bash
   cp -r sdks/react-native/sample sdks/react-native/<new-name>
   ```
   - Update `package.json`: change `name` to `@papaya/<new-name>-react-native`
   - Update the dependency from `@papaya/sample` to `@papaya/<new-name>` (keep `workspace:*`)

4. **Copy native SDK templates (if needed)**
   - iOS: `cp -r sdks/ios/sample sdks/ios/<NewName>` — update `Package.swift` module name to `Papaya<NewName>SDK`
   - Android: `cp -r sdks/android/sample sdks/android/<new-name>` — update `build.gradle.kts` and module/package names

5. **Install dependencies**
   ```bash
   cd sdks && bun install
   ```

6. **Verify linking**
   ```bash
   cd sdks && bun run typecheck
   cd sdks && bun run test
   ```

## Naming Convention

| Platform | Package name |
|----------|-------------|
| Node | `@papaya/<name>` |
| React | `@papaya/<name>-react` |
| React Native | `@papaya/<name>-react-native` |
| iOS | `Papaya<Name>SDK` (Swift Package) |
| Android | `<name>-sdk-android` (Kotlin/Gradle) |

## Publishing

TypeScript SDKs publish to AWS CodeArtifact. Authenticate first:

```bash
aws codeartifact login --tool npm --domain papaya --domain-owner 812652266901 --repository sdks --region ap-southeast-1
```

Always publish from CI — never from a local machine.
