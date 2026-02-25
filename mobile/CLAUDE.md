# Mobile — React Native + Expo

## Overview

Expo React Native app for Papaya. Provides mobile access to claims management and FWA detection for adjusters and analysts in the field. Runs on iOS and Android from a single codebase.

## Tech Stack

| Layer              | Choice                                    |
| ------------------ | ----------------------------------------- |
| Framework          | React Native 0.76+ via Expo SDK 52        |
| Navigation         | Expo Router (file-based routing)          |
| Language           | TypeScript (strict mode)                  |
| State              | Zustand (local), TanStack Query (server)  |
| Build Service      | EAS Build (Expo Application Services)     |
| OTA Updates        | EAS Update                                |
| Package Manager    | Bun                                       |

## Folder Structure

```
mobile/
├── CLAUDE.md
├── package.json
├── app.json               # Expo configuration
├── tsconfig.json
├── babel.config.js
├── metro.config.js        # Monorepo-aware Metro config
├── app/                   # Expo Router — file-based routing
│   ├── _layout.tsx        # Root layout
│   ├── index.tsx          # Entry redirect
│   └── (tabs)/            # Tab navigation
│       ├── _layout.tsx
│       ├── index.tsx      # Dashboard
│       ├── claims.tsx     # Claims list
│       └── settings.tsx   # Settings
├── components/            # Shared mobile components
├── constants/             # Colors, spacing, typography tokens
├── hooks/                 # Custom hooks
├── services/              # API clients, auth, storage
└── assets/                # Images, fonts
```

## Development

```bash
# Install dependencies
cd mobile && bun install

# Start Expo dev server
bun start

# Run on specific platform
bun run ios
bun run android

# Type check
bun run typecheck
```

## Key Patterns

### Expo Router

All navigation is file-based via `app/` directory. Route groups use `(parentheses)` syntax. Layouts use `_layout.tsx`.

### Native Modules

When partners require platform-specific SDK integration (iOS/Android native), use Expo Modules API or create a config plugin. Never eject — use development builds instead.

### Sharing Code with Platform

The mobile app can import from SDK packages in `sdks/` (e.g., `@papaya/<name>` for Node SDKs or `@papaya/<name>-react-native` for RN SDKs). For shared types, prefer importing from the SDK packages rather than `platform/libs/shared-types` to keep the mobile app decoupled from the web platform.

### Styling

Use React Native's `StyleSheet.create()` — no Tailwind, no CSS. Keep styles co-located with components. For consistent theming, define tokens in `constants/Colors.ts`.

### Offline Support

Mobile apps must handle offline gracefully. Cache API responses locally and sync when connectivity returns. Use expo-sqlite or AsyncStorage for local persistence.

## Work Scope

When working in this folder, only reference:
- Files within `mobile/`
- `sdks/` for SDK packages
- Root `tsconfig.json` if relevant

Do not read or modify files in `platform/`, `agents/`, `hasura/`, or `rootstock/`.
