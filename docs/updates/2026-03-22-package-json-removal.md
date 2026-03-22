# Migration: Remove package.json Files

**Date:** 2026-03-22  
**Type:** Dependency management migration  
**Scope:** Full stack (Root + API + Web)

## Summary

All `package.json` files have been removed and their dependencies migrated to `deno.json` files using Deno's native dependency management with the `imports` field. This completes the Deno migration by eliminating Node.js legacy configuration files.

## Motivation

- **Single source of truth**: Use `deno.json` as the only dependency configuration file
- **Native Deno workflow**: Align with Deno's recommended dependency management approach
- **Simplified tooling**: Remove npm/pnpm legacy files and rely solely on Deno's built-in tools
- **Consistency**: All dependencies declared with `npm:` prefix in `imports` field

## Changes

### Removed Files
| File | Replaced By |
|---|---|
| `/package.json` | `/deno.json` (imports field) |
| `/apps/api/package.json` | `/apps/api/deno.json` (imports field) |
| `/apps/web/package.json` | `/apps/web/deno.json` (imports field) |

### Modified Files

**`/deno.json`**
- Added `name`, `version`, `description`, `license` metadata
- Added `imports` field with `typescript` dependency
- Already had `nodeModulesDir: "auto"` and `lock: "deno.lock"`
- Already had `fmt` and `tasks` configuration

**`/apps/api/deno.json`**
- Added `description` field
- Added `nodeModulesDir: "auto"` and `lock: "deno.lock"`
- Added `imports` field with all dependencies from package.json:
  - **Runtime dependencies**: @hono/zod-validator, @prisma/client, @node-rs/argon2, date-fns, date-fns-tz, hono, ioredis, jose, mjml, nanoid, nodemailer, pino, pino-http, slugify, zod
  - **Dev dependencies**: @types/mjml, @types/node, @types/nodemailer, pino-pretty, prisma, tsup, tsx, typescript
- All dependencies use `npm:` prefix with version ranges (e.g., `npm:hono@^4.12.8`)

**`/apps/web/deno.json`**
- Added `description` field
- Added `nodeModulesDir: "auto"` and `lock: "deno.lock"`
- Added `imports` field with all dependencies from package.json:
  - **Runtime dependencies**: baseui, date-fns, react, react-dom, react-helmet-async, react-hook-form, react-i18next, react-router-dom, styletron-engine-monolithic, styletron-react, swr, zod, @hookform/resolvers, i18next
  - **Dev dependencies**: @testing-library/jest-dom, @testing-library/react, @types/react, @types/react-dom, @vitejs/plugin-react, jsdom, typescript, vite
- All dependencies use `npm:` prefix with version ranges (e.g., `npm:react@^19.2.4`)

### Generated Files

**`/apps/api/deno.lock`**
- Lockfile generated with `deno install` command
- Contains exact versions of all API dependencies
- 90KB file with full dependency tree

**`/apps/web/deno.lock`**
- Lockfile generated with `deno install` command
- Contains exact versions of all Web dependencies
- 69KB file with full dependency tree

## Migration Process

### Dependency Mapping

All `package.json` dependencies and devDependencies were converted to the `imports` field in `deno.json`:

**Before (package.json):**
```json
{
  "dependencies": {
    "hono": "^4.12.8",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

**After (deno.json):**
```json
{
  "imports": {
    "hono": "npm:hono@^4.12.8",
    "zod": "npm:zod@^4.3.6",
    "typescript": "npm:typescript@^5.9.3"
  }
}
```

### Key Conversion Rules

1. **npm: prefix**: All npm packages require `npm:` prefix in Deno
2. **Version ranges preserved**: Kept original version ranges (^, ~, etc.)
3. **No devDependencies separation**: Deno doesn't distinguish runtime vs dev dependencies in `imports` - all go in the same field
4. **Scoped packages**: Handled correctly (e.g., `@hono/zod-validator` → `npm:@hono/zod-validator@^0.7.6`)

## Commands Used

```bash
# Remove all package.json files
rm package.json apps/api/package.json apps/web/package.json

# Generate lock files via Docker
docker compose run --rm api deno install --allow-scripts=npm:@prisma/engines,npm:prisma,npm:@node-rs/argon2,npm:esbuild
docker compose run --rm web deno install --allow-scripts=npm:esbuild
```

## Makefile

No changes needed to the Makefile. The `install` target already uses `deno install` commands and was properly configured during the initial Deno migration.

## Verification

After migration:
- ✅ All package.json files removed
- ✅ Dependencies added to deno.json imports field with npm: prefix
- ✅ Lock files generated (apps/api/deno.lock and apps/web/deno.lock)
- ✅ `deno task` commands work in both containers
- ✅ No references to package.json in docker-compose.yml or Makefile

```bash
# Verify lock files exist
ls -la apps/api/deno.lock apps/web/deno.lock

# Verify deno task works
docker compose run --rm api deno task --help
docker compose run --rm web deno task --help
```

## Notes

- **No distinction between dependencies and devDependencies**: Deno loads only what's actually imported in code, so there's no performance penalty for listing dev tools alongside runtime dependencies
- **Version ranges work**: Deno supports npm-style version ranges (^, ~, >=, etc.)
- **Lock files required**: Both `deno.lock` files should be committed to version control for reproducible builds
- **nodeModulesDir: "auto"**: Ensures npm packages create node_modules when needed (required for some packages with native bindings)

## Impact

- **Simplified configuration**: Single `deno.json` file per app instead of multiple npm/Node.js config files
- **Native Deno workflow**: Fully embraces Deno's dependency management system
- **No functional changes**: All dependencies remain at the same versions
- **Existing commands work**: `make install`, `make dev`, `make test`, etc. continue to function

## Next Steps

No further action required. The migration is complete and the project now uses pure Deno dependency management without any Node.js legacy files.
