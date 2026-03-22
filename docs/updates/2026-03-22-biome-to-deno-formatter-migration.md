# Migration: Biome → Deno Formatter

**Date:** March 22, 2026  
**Status:** Completed

## Overview

Migrated from Biome.js to Deno's built-in formatter and linter as part of the Node.js to Deno migration. Deno provides native formatting and linting tools that align better with our tech stack.

## Changes Made

### 1. Configuration Files

#### Root `deno.json`
Added Deno formatter configuration matching previous Biome settings:

```json
{
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "semiColons": true,
    "singleQuote": true,
    "exclude": [
      "node_modules",
      "dist",
      ".next",
      "coverage",
      "apps/api/prisma/migrations"
    ]
  }
}
```

#### App-level `deno.json` Files
Updated tasks in `apps/api/deno.json` and `apps/web/deno.json`:

```json
{
  "tasks": {
    "lint": "deno lint src/",
    "lint:fix": "deno lint --fix src/",
    "format": "deno fmt src/ prisma/",
    "format:check": "deno fmt --check src/ prisma/",
    "check": "deno task lint && deno task format:check && deno task typecheck"
  }
}
```

### 2. Removed Files & Dependencies
- **Deleted:** `biome.json`
- **Removed from `package.json`:** `@biomejs/biome` dependency
- **Removed:** All `biome-ignore` comments from source files
- **Updated:** `.windsurf/rules/common-guidelines.md` to reference Deno formatter

### 3. Updated Infrastructure

#### Makefile Commands
```makefile
make format          # Format all code (API + Web)
make format-check    # Check formatting without changes
make lint            # Run linter on all apps
make lint-fix        # Auto-fix linting issues
make check           # Run all checks (lint + format + typecheck)
```

#### CI/CD Workflow
Updated `.github/workflows/ci.yml`:
- Renamed job to "Lint & Format"
- Added format checking step
- Uses `deno task lint` and `deno task format:check`

## Using the Formatter

### Through Docker (Recommended)

All commands run through Docker to ensure consistent environments:

```bash
# Format code
make format

# Check formatting without making changes
make format-check

# Lint code
make lint

# Auto-fix linting issues
make lint-fix

# Run all checks (lint, format, typecheck)
make check
```

### Direct Deno Commands (Inside Container)

If you're inside a container shell (`make shell-api` or `make shell-web`):

```bash
# Format files (respects deno.json excludes)
deno fmt

# Check formatting
deno fmt --check

# Lint files
deno lint src/

# Fix linting issues
deno lint --fix src/
```

**Important:** Always use `deno fmt` without specifying paths when formatting. This ensures Deno respects the `exclude` patterns in `deno.json` and won't try to format Prisma generated files.

## IDE Setup

### VS Code (and VSCode Forks: Cursor, Windsurf, etc.)

#### 1. Install Deno Extension
Install the official **Deno extension** by Denoland from the marketplace:
- Extension ID: `denoland.vscode-deno`
- [VS Code Marketplace Link](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)

#### 2. Configure Workspace Settings

Create or update `.vscode/settings.json` in the project root:

```json
{
  "deno.enable": true,
  "deno.enablePaths": ["./apps/api", "./apps/web"],
  "editor.defaultFormatter": "denoland.vscode-deno",
  "editor.formatOnSave": true,
  "[typescript]": {
    "editor.defaultFormatter": "denoland.vscode-deno"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "denoland.vscode-deno"
  },
  "[javascript]": {
    "editor.defaultFormatter": "denoland.vscode-deno"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "denoland.vscode-deno"
  }
}
```

#### 3. TypeScript Configuration for `.ts` Imports

Both `tsconfig.json` files are configured to allow `.ts` extensions in imports:

**`apps/api/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true,
    // ... other options
  }
}
```

**`apps/web/tsconfig.json`:**
```json
{
  "compilerOptions": {
    "allowImportingTsExtensions": true,
    "noEmit": true,
    // ... other options
  }
}
```

**Note:** `allowImportingTsExtensions` requires `noEmit: true` because TypeScript cannot emit files with `.ts` import paths (they would break at runtime in Node.js). This is fine for Deno since it runs TypeScript directly.

#### 4. Per-App Settings (Optional)

For finer control, you can add `.vscode/settings.json` in each app directory:

**`apps/api/.vscode/settings.json`:**
```json
{
  "deno.enable": true,
  "editor.defaultFormatter": "denoland.vscode-deno",
  "editor.formatOnSave": true
}
```

**`apps/web/.vscode/settings.json`:**
```json
{
  "deno.enable": true,
  "editor.defaultFormatter": "denoland.vscode-deno",
  "editor.formatOnSave": true
}
```

### Other Editors

#### JetBrains IDEs (WebStorm, IntelliJ IDEA)
1. Install the **Deno plugin** from JetBrains Marketplace
2. Enable Deno support in **Settings → Languages & Frameworks → Deno**
3. Configure formatter to use Deno in **Settings → Editor → Code Style**

#### Vim/Neovim
Use a Deno LSP client like:
- `vim-deno` plugin
- Configure with `nvim-lspconfig` for Neovim

#### Sublime Text
Install the **Deno** package via Package Control

## Running the Migration

If you're applying this migration to your local environment:

```bash
# 1. Start services
make dev

# 2. Remove Biome dependencies (already done in this migration)
# Biome has been removed from package.json

# 3. Reinstall dependencies
make install

# 4. Format all code with Deno formatter
make format

# 5. Verify formatting
make format-check

# 6. Run all checks
make check
```

## Formatter Configuration Reference

Our Deno formatter is configured with:
- **Line width:** 100 characters
- **Indentation:** 2 spaces (not tabs)
- **Quotes:** Single quotes
- **Semicolons:** Enabled
- **Excluded paths:** node_modules, dist, coverage, Prisma migrations

These settings match our previous Biome configuration for consistency.

## Testing Configuration

### Import Maps for Test Mocking

Tests use **import maps** (`src/test/import_map.json`) to redirect module imports to mock implementations during test runs. This is a **required** feature, not optional.

**API Example (`apps/api/src/test/import_map.json`):**
```json
{
  "imports": {
    "../utils/database/index.js": "./mocks/database.ts",
    "../utils/redis/index.js": "./mocks/redis.ts",
    "../middleware/auth.js": "./mocks/auth-middleware.ts"
  }
}
```

This allows tests to import modules like `import { getPrisma } from '../utils/database/index.js'` but receive the mock implementation at runtime without modifying source code.

### Why Import Maps are Necessary

Import maps enable **module-level mocking** in Deno tests:
- Tests import from the actual module path (e.g., `../utils/database/index.js`)
- Deno redirects the import to the mock file (e.g., `./mocks/database.ts`)
- No need to modify source code or use dependency injection everywhere
- Mocks are isolated to test runs only via `--import-map` flag

### TypeScript Import Convention

**Important:** Deno runs TypeScript files directly **without compilation**. We use explicit `.ts` extensions in all imports.

#### Import Style

```typescript
// ✅ Use explicit .ts extensions
import { getPrisma } from '../utils/database/index.ts'
import { getLogger } from '../logger/index.ts'

// ✅ No extension needed for external packages
import { Hono } from 'hono'
import { z } from 'zod'

// ✅ Prisma generated types (no extension)
import { PrismaClient } from '../../../prisma/generated/prisma'
```

See Dockerfile line 25: *"Production stage — no compilation needed; Deno runs TypeScript directly"*

#### Why Only `--no-check` for Tests?

**`--no-check`:**
- Skips type checking during test runs
- Necessary because type checker runs **before** import maps are applied
- Production code still type-checked via `deno task typecheck`

**`--import-map`:**
- Redirects imports to mock implementations (e.g., database → mock)
- Only active during test runs via `--import-map` flag
- Enables module-level mocking without code changes

**No `--sloppy-imports` needed** - we use explicit `.ts` extensions throughout.

#### Production Type Safety

```bash
deno task typecheck  # Strict type checking for production code
deno task check      # Runs lint + format + typecheck
```

Tests use `--no-check` but **production builds are strictly type-checked**.

### Test Commands

```bash
# Run all tests (API + Web)
make test

# Run API tests only
docker compose exec api deno task test

# Run Web tests only
docker compose exec web deno task test

# Watch mode (inside container)
make shell-api
deno task test:watch
```

### Test Configuration Files

**API (`apps/api/deno.json`):**
```json
{
  "tasks": {
    "test": "deno test --allow-all --no-check --import-map=src/test/import_map.json src/",
    "test:watch": "deno test --allow-all --no-check --watch --import-map=src/test/import_map.json src/"
  }
}
```

**Web (`apps/web/deno.json`):**
```json
{
  "tasks": {
    "test": "deno test --allow-all --no-check --import-map=src/test/import_map.json src/",
    "test:watch": "deno test --allow-all --no-check --watch --import-map=src/test/import_map.json src/"
  }
}
```

**Note:** Only two flags are needed:
- `--no-check`: Skips type checking (runs before import maps)
- `--import-map`: Redirects imports to mock implementations

## Benefits

1. **Native Integration:** Deno's formatter is built-in, no external dependencies
2. **Faster:** Rust-based tooling with better performance
3. **Consistency:** Same formatter used by the Deno ecosystem
4. **Simplified Toolchain:** One less dependency to manage
5. **Better IDE Support:** Official Deno extension provides excellent LSP support

## Troubleshooting

### Formatter freezes or hangs
**Problem:** Running `make format` or `deno fmt` hangs or freezes indefinitely.

**Cause:** Prisma generates very large files in `apps/api/prisma/generated/` that can cause the formatter to hang when processing.

**Solution:** We've excluded Prisma generated files from formatting in both root and app-level `deno.json`:

```json
// Root deno.json
{
  "fmt": {
    "exclude": [
      "apps/api/prisma/migrations",
      "apps/api/prisma/generated"
    ]
  }
}

// apps/api/deno.json
{
  "fmt": {
    "exclude": ["prisma/generated", "prisma/migrations"]
  }
}
```

If you still experience freezing:
1. Make sure the excludes are properly configured
2. Try formatting specific directories instead of the entire project
3. Check if node_modules are properly excluded

### Formatter not working in IDE
1. Ensure Deno extension is installed and enabled
2. Check `.vscode/settings.json` has `"deno.enable": true`
3. Restart VS Code/editor
4. Run `Deno: Initialize Workspace Configuration` from command palette

### Different formatting between IDE and CLI
- Ensure both use the same `deno.json` configuration
- Check no conflicting formatters are enabled (Prettier, etc.)
- Verify Deno extension version matches CLI version

### Format on save not working
1. Confirm `"editor.formatOnSave": true` in settings
2. Ensure Deno is set as default formatter for TypeScript/JavaScript
3. Check no other extensions are interfering

## References

- [Deno Formatter Documentation](https://docs.deno.com/runtime/fundamentals/linting_and_formatting/)
- [VS Code Deno Extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
- [Deno Configuration Reference](https://docs.deno.com/go/config)
