---
description: Platform development patterns reminder
paths:
  - "platform/**"
---

# Platform Development

Load the `platform-dev` skill when:
- Configuring or modifying Module Federation (vite.config.ts, remote/host registration)
- Adding or modifying UI components (shadcn/ui, composites, shared-ui)
- Unsure about code conventions (feature folders, state management, styling rules)
- Setting up standalone vs embedded mode for a remote app

Load the `new-remote-app` skill when:
- Creating a brand-new remote app from the sample template

Skip both skills when:
- Only reading platform code to understand it (no changes)
- Running or debugging tests without modifying component structure
- Updating non-UI files (package.json scripts, CI config)
