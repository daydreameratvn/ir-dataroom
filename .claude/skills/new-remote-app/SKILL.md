---
name: new-remote-app
description: |
  Create a new micro frontend remote app in platform/.
  Copies the sample template, configures Module Federation, and registers in shell.
---

# New Remote App Scaffold

See `platform/CLAUDE.md` for Module Federation patterns and conventions.

## Steps

1. **Copy the template**
   ```bash
   cp -r platform/apps/sample platform/apps/<new-name>
   ```

2. **Update `apps/<new-name>/package.json`**
   - Change `name` to `@papaya/<new-name>`
   - Update dev script: `portless <new-name>.oasis vite`
   - Add `dev:legacy` script with next available port (check existing apps for the last port used)

3. **Update `apps/<new-name>/vite.config.ts`**
   - Change federation `name` to `<new-name>`
   - Set `server.port` to the legacy port

4. **Update `apps/<new-name>/index.html`**
   - Change `<title>` to the app's display name

5. **Register in shell — `apps/shell/vite.config.ts`**
   - Add to `remotes`:
     ```ts
     <newName>: {
       type: 'module',
       name: '<newName>',
       entry: process.env.VITE_<NEWNAME>_URL ?? 'http://<new-name>.oasis.localhost:1355/mf-manifest.json',
       entryGlobalName: '<newName>',
     }
     ```

6. **Add module declaration — `apps/shell/src/vite-env.d.ts`**
   ```ts
   declare module '<newName>/*';
   ```

7. **Add route — `apps/shell/src/routes.tsx`**
   ```tsx
   {
     path: '/<path>',
     element: <RemoteLoader remote="<newName>" module="./entry" />,
   }
   ```

8. **Install dependencies**
   ```bash
   cd platform && bun install
   ```

9. **Verify**
   ```bash
   cd platform && bun run typecheck
   cd platform && bun run dev
   ```
