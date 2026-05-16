# BrewForm Dependency Update Plan

> **Status**: Plan | **Date**: 2026-05-16 | **Scope**: All 4 workspace packages
>
> Based on: 9 open Renovate PRs with CodeRabbit analysis, Renovate Dashboard (#8),
> full codebase audit, deno.lock cross-reference.

---

## 1. Version Summary

### 1.1 Current → Target (All Packages)

| Package | Current | Target | Breaking? | Complexity | Risk |
|---------|---------|--------|-----------|------------|------|
| **apps/api** |
| zod | ^3.24.0 (lock: 3.25.76) | ^4.0.0 (4.4.3) | YES (major API) | HIGH | HIGH |
| hono | ^4.7.0 (lock: 4.12.18) | ^4.7.0 (4.12.19) | No | LOW | LOW |
| pino | ^9.6.0 (lock: 9.14.0) | ^10.0.0 (10.3.1) | No (Node 18 drop only) | LOW | LOW |
| bcryptjs | ^2.4.3 | ^3.0.0 (3.0.3) | YES ($2b hash, ESM) | MEDIUM | MEDIUM |
| mjml | ^4.15.0 (lock: 4.18.0) | ^5.0.0 (5.2.1) | YES (HTML output) | MEDIUM | MEDIUM |
| pino-pretty | ^13.0.0 (lock: 13.1.3) | ^13.0.0 | No | LOW | LOW |
| @hono/zod-validator | ^0.8.0 | ^0.8.0 | CHECK compat | MEDIUM | MEDIUM |
| @hono/standard-validator | ^0.2.0 (lock: 0.2.2) | ^0.2.0 | No | LOW | LOW |
| hono-openapi | ^1.0.0 (lock: 1.3.0) | ^1.0.0 | No | LOW | LOW |
| date-fns | ^4.1.0 | ^4.1.0 | No | LOW | LOW |
| qrcode | ^1.5.4 | ^1.5.4 | No | LOW | LOW |
| nodemailer | ^8.0.6 (lock: 8.0.7) | ^8.0.6 | No | LOW | LOW |
| drizzle-orm | ^0.45.0 (lock: 0.45.2) | ^0.45.0 | No | LOW | LOW |
| @types/bcryptjs | ^2.4.6 | **REMOVE** | Deprecated (stub) | LOW | LOW |
| @types/qrcode | ^1.5.5 (lock: 1.5.6) | ^1.5.5 | No | LOW | LOW |
| @types/nodemailer | ^8.0.0 | ^8.0.0 | No | LOW | LOW |
| @std/testing (jsr) | ^1.0.18 (lock: 1.0.18) | ^1.0.18 | No | LOW | LOW |
| @std/expect (jsr) | ^1.0.19 (lock: 1.0.19) | ^1.0.19 | No | LOW | LOW |
| **apps/web** |
| react | ^19.1.0 (lock: 19.2.6) | ^19.1.0 | No | LOW | LOW |
| react-dom | ^19.1.0 (lock: 19.2.6) | ^19.1.0 | No | LOW | LOW |
| react-router | ^7.5.0 (lock: 7.15.0) | ^7.5.0 (7.15.1) | No | LOW | LOW |
| @base-ui-components/react | ^1.0.0-alpha.7 (lock: 1.0.0-rc.0) | **REPLACE with @base-ui/react** | YES (deprecated) | MEDIUM | MEDIUM |
| vite | ^6.3.0 (lock: 6.4.2) | ^8.0.0 (8.0.13) | YES (Rolldown, Vite Env API) | HIGH | HIGH |
| @vitejs/plugin-react | ^4.4.0 (lock: 4.7.0) | ^6.0.0 (6.0.2) | YES (requires Vite 8, drops Babel) | MEDIUM | MEDIUM |
| tailwindcss | ^4.1.0 (lock: 4.3.0) | ^4.1.0 | No | LOW | LOW |
| @tailwindcss/vite | ^4.1.0 (lock: 4.3.0) | ^4.1.0 | No | LOW | LOW |
| typescript | ^5.8.0 (lock: 5.9.3) | ^6.0.0 (6.0.3) | YES (default changes) | MEDIUM | MEDIUM |
| @types/react | ^19.1.0 (lock: 19.2.14) | ^19.1.0 | No | LOW | LOW |
| @types/react-dom | ^19.1.0 (lock: 19.2.3) | ^19.1.0 | No | LOW | LOW |
| vitest | ^3.2.0 (lock: 3.2.4) | ^4.0.0 (4.1.6) | YES (API changes) | MEDIUM | MEDIUM |
| @vitest/coverage-v8 | ^3.2.0 (lock: 3.2.4) | ^4.0.0 (4.1.6) | YES (API changes) | MEDIUM | MEDIUM |
| @testing-library/react | ^16.3.0 (lock: 16.3.2) | ^16.3.0 | No | LOW | LOW |
| @testing-library/user-event | ^14.6.1 | ^14.6.1 | No | LOW | LOW |
| @testing-library/jest-dom | ^6.6.3 (lock: 6.9.1) | ^6.6.3 | No | LOW | LOW |
| jsdom | ^29.0.0 (lock: 29.1.1) | ^29.0.0 | No | LOW | LOW |
| fast-check | ^3.22.0 (lock: 3.23.2) | ^4.0.0 (4.8.0) | YES (API removals) | MEDIUM | MEDIUM |
| **packages/db** |
| drizzle-orm | ^0.45.0 (lock: 0.45.2) | ^0.45.0 | No | LOW | LOW |
| postgres | ^3.4.5 (lock: 3.4.9) | ^3.4.5 | No | LOW | LOW |
| bcryptjs | ^2.4.3 | ^3.0.0 (3.0.3) | YES ($2b hash, ESM) | MEDIUM | MEDIUM |
| drizzle-kit | ^0.31.0 (lock: 0.31.10) | ^0.31.0 | No | LOW | LOW |
| @std/testing (jsr) | ^1.0.18 (lock: 1.0.18) | ^1.0.18 | No | LOW | LOW |
| @std/expect (jsr) | ^1.0.19 (lock: 1.0.19) | ^1.0.19 | No | LOW | LOW |
| **packages/shared** |
| zod | ^3.24.0 (lock: 3.25.76) | ^4.0.0 (4.4.3) | YES (major API) | HIGH | HIGH |
| date-fns | ^4.1.0 | ^4.1.0 | No | LOW | LOW |

---

## 2. Per-Package Deep Dive

### 2.1 zod v3 → v4 (apps/api + packages/shared)

**PR**: [#24](https://github.com/Ardakilic/BrewForm/pull/24)  
**Confidence**: 8/10 (read zod v4 docs, scanned all 17 schema files)  
**Risk Level**: HIGH  
**Reversibility**: Reversible via git revert  

#### Breaking Changes

Zod v4 is a major rewrite with API differences from v3. Key breaking changes:

1. **Import paths changed**: `z.object()`, `z.string()`, `z.number()` etc. remain top-level but some utilities moved
2. **`.refine()` behavior**: Refinements on `.pick()` / `.omit()` / `.extend()` now throw errors — use `.safeExtend()` instead
3. **Schema composition**: Object masking methods (`.pick()`, `.omit()`) now validate keys exist
4. **No `.nonempty()` on strings** — replaced by `.min(1)` pattern
5. **`z.enum()` may have changed semantics**
6. **ZodError formatting**: `flatten()` and `format()` APIs may differ

#### Code Changes Required

**Files to audit** (17+ schema files + usage sites):

**packages/shared/src/schemas/** (all schema definitions):
| File | Zod Features Used | Migration Notes |
|------|------------------|-----------------|
| `auth.schema.ts` | z.object, z.string, z.email, z.min/max | Verify .email() API unchanged |
| `badge.schema.ts` | z.object, z.enum | Verify z.enum() compatibility |
| `bean.schema.ts` | z.object, z.string, z.number, z.enum, optional | Check optional behavior |
| `comment.schema.ts` | z.object, z.string, optional, nullable | Verify nullable behavior |
| `common.schema.ts` | z.string, z.number, pagination helpers | Core validation — test thoroughly |
| `equipment.schema.ts` | z.object, z.string, z.enum | Enum compatibility |
| `follow.schema.ts` | z.object | Standard object, low risk |
| `photo.schema.ts` | z.object, z.string, z.url | URL validation check |
| `recipe.schema.ts` | z.object, z.array, z.string, z.number, z.enum, refine | **HIGH RISK**: Uses `.refine()` — check v4 behavior |
| `setup.schema.ts` | z.object, z.string, z.number | Standard, low risk |
| `taste.schema.ts` | z.object, z.string | Standard, low risk |
| `user.schema.ts` | z.object, z.string, z.email, z.url, min/max, refine | Uses `.refine()` — check v4 behavior |
| `vendor.schema.ts` | z.object, z.string | Standard, low risk |
| `index.ts` | Re-exports all schemas | Update if imports change |

**apps/api/src/modules/** (schema consumers):
- All `module/*/index.ts` files that import from `@brewform/shared/schemas`
- All `module/*/service.ts` files that use `.parse()`, `.safeParse()`
- `middleware/*.ts` that use zod validators

**apps/web/src/** (from shared package):
- All components using `zValidator` with zod schemas
- Import paths from `@brewform/shared/schemas`

#### @hono/zod-validator Compatibility Check

⚠ **CRITICAL**: `@hono/zod-validator` (v0.8.0) must be compatible with zod v4. Actions:
1. Check npm registry: does `@hono/zod-validator@0.8.0` list zod v4 in peer dependencies?
2. If not, update `@hono/zod-validator` to latest version supporting zod v4
3. Check `hono-openapi` compatibility with zod v4
4. Run full type-check after upgrade

#### Migration Steps
1. Update `packages/shared/package.json`: `"zod": "^4.0.0"`
2. Update `apps/api/package.json`: `"zod": "^4.0.0"`
3. Run `deno install` to update lockfile
4. Run `deno task check` — catalog all type errors
5. Fix schema files one by one, running tests after each
6. Pay special attention to `.refine()` call sites
7. Verify `@hono/zod-validator` compatibility
8. Run full test suite

---

### 2.2 pino v9 → v10 (apps/api)

**PR**: [#21](https://github.com/Ardakilic/BrewForm/pull/21)  
**Confidence**: 9/10 (CodeRabbit verified, scanned logger module)  
**Risk Level**: LOW  
**Reversibility**: Reversible

#### Breaking Changes

- Only breaking change: **dropped Node.js 18 support** — irrelevant for Deno
- v10.1.0 censors function type changed (not used in codebase)
- Internally switched from `fast-redact` to `@pinojs/redact` — your string-path config is compatible
- `pino-pretty@13.1.3` already compatible with pino v10

#### Code Changes Required

**None.** Your logger module (`apps/api/src/utils/logger/index.ts`) uses:
- `level` config → unchanged
- `redact` with path strings → unchanged
- `pino.stdSerializers.err` → still present in v10
- `transport: { target: 'pino-pretty' }` → lockfile already resolves pino-pretty@13.1.3

#### Verification
- Run `deno task check` for apps/api
- Confirm structured logging still works in dev mode
- Check that pino-pretty transport still formats correctly

---

### 2.3 bcryptjs v2 → v3 (apps/api + packages/db)

**PR**: [#17](https://github.com/Ardakilic/BrewForm/pull/17)  
**Confidence**: 8/10 (CodeRabbit verified, scanned all bcrypt usage)  
**Risk Level**: MEDIUM  
**Reversibility**: Reversible (existing hashes still work)

#### Breaking Changes

1. **Hash format change**: v3 generates `$2b$` hashes by default (was `$2a$`)
   - Existing `$2a$` hashes continue to verify — backward compatible
   - New passwords will use `$2b$` — test comparisons
2. **ESM module now default export** — check import patterns
3. **`@types/bcryptjs` is now redundant** — bcryptjs v3 ships its own types
4. **New helper**: `bcryptjs.checkPasswordLength()` available but optional

#### Code Changes Required

**Files using bcryptjs**:
| File | Import Style | Action Needed |
|------|-------------|---------------|
| `apps/api/src/modules/auth/model.ts` | `import * as bcrypt from 'bcryptjs'` + defensive fallback | Already safe pattern — verify v3 ESM works |
| `apps/api/src/modules/admin/model.ts` | `import * as bcrypt from 'bcryptjs'` + direct destructure | Add defensive fallback like auth/model.ts |
| `apps/api/src/setup.ts` | `import * as bcrypt from 'bcryptjs'` + direct destructure | Add defensive fallback |
| `packages/db/src/seed-data.ts` | Uses `bcryptjs.hashSync()` | Verify import works with v3 ESM |

**Code change**: In `apps/api/src/setup.ts` and `apps/api/src/modules/admin/model.ts`, update to use the same defensive import pattern as `auth/model.ts`:

```typescript
import * as bcrypt from 'bcryptjs';
const hashSync = (bcrypt as any).hashSync || (bcrypt as any).default?.hashSync;
if (!hashSync) throw new Error('hashSync could not be resolved from bcryptjs');
```

Or, since v3 has proper named ESM exports, simply use:
```typescript
import { hashSync, compareSync } from 'bcryptjs';
```

**Remove**: `@types/bcryptjs` from `apps/api/package.json` `devDependencies`

#### Verification
- Run `deno task check` for apps/api and packages/db
- Run auth tests: `deno test apps/api/src/modules/auth/`
- Run seed tests: `deno test packages/db/src/seed.test.ts`
- Verify password hashing and comparison still works
- No literal hash prefix comparisons found in codebase — safe

---

### 2.4 mjml v4 → v5 (apps/api — email templates)

**PR**: [#20](https://github.com/Ardakilic/BrewForm/pull/20)  
**Confidence**: 8/10 (CodeRabbit verified, scanned all 6 templates)  
**Risk Level**: MEDIUM  
**Reversibility**: Reversible (revert + regenerate templates)

#### Breaking Changes

1. **`mj-body background-color`**: In v5, applied to child `<div>`, NOT the `<body>` tag
   - All 6 email templates use `background-color="#F5F0EB"` on `<mj-body>`
   - ⚠️ Background may disappear in Outlook/older email clients
2. **Minification engine changed**: `html-minifier` → `htmlnano` + `cssnano`
   - Generated HTML output format may differ
3. **Includes locked down by default**: Not used in codebase — no impact
4. **`mj-body` attributes refactored**: `class` now on `<body>`, not child `<div>`

#### Code Changes Required

**Files to check**:
- All 6 `.mjml` templates in `apps/api/src/templates/email/`:
  - `welcome.mjml`
  - `reset-password.mjml`
  - `recipe-liked.mjml`
  - `recipe-commented.mjml`
  - `new-follower.mjml`
  - `followed-user-posted.mjml`

**Type definitions**: Update `apps/api/src/types/mjml.d.ts`:
1. Remove `minify?: boolean` and `beautify?: boolean` or update to v5 equivalent
2. Add `formattedMessage?: string` to error type (used by build script)

**Generated templates**: After installing mjml v5, regenerate:
```bash
deno task email-build
```

#### Verification
- Run `deno task email-build` — ensure it succeeds with v5
- **Visual verification** (CRITICAL): Check all 6 email templates for:
  - Background color (`#F5F0EB`) rendering
  - Proper layout in Gmail, Outlook, Apple Mail
  - All links and dynamic content (Handlebars `{{ }}` in href attrs)

---

### 2.5 TypeScript v5 → v6 (apps/web)

**PR**: [#22](https://github.com/Ardakilic/BrewForm/pull/22)  
**Confidence**: 7/10 (read TS 6 release notes, scanned all 4 tsconfigs)  
**Risk Level**: MEDIUM  
**Reversibility**: Reversible

#### Breaking Changes (Default Shifts)

All 4 tsconfigs already have `"strict": true`, `"moduleResolution": "bundler"`, explicit `target`/`module` — so most TS 6 defaults won't re-break. However:

1. **`types` defaults to `[]`**: Previously auto-discovered all `@types/*` packages. If your `tsconfig.json` doesn't explicitly list `"types"`, you'll lose auto-discovery of:
   - `@types/react`, `@types/react-dom`
   - `@types/node` (used in config files)
   - `vitest` globals types

2. **`rootDir` defaults to tsconfig directory**: May change output paths — but web doesn't emit via tsc

3. **`noUncheckedSideEffectImports` defaults to `true`**: May flag side-effect imports

4. **`baseUrl` deprecated**: `apps/web/tsconfig.json` uses `"baseUrl": "."` with `"paths"` — still works but shows deprecation warning

5. **`esModuleInterop` can't be `false`**: Already `true` in all configs

6. **AMD/UMD/outFile removed**: Not used anywhere in codebase

7. **Import assertions** `assert {}` → `with {}`: Not used in codebase

#### Code Changes Required

**apps/web/tsconfig.json** — add explicit types array:
```json
{
  "compilerOptions": {
    "types": ["vite/client", "vitest", "@testing-library/jest-dom"]
  }
}
```

**Optional cleanup**: Remove `"baseUrl": "."` (paths work without it in TS 6):
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@brewform/shared": ["../../packages/shared/src/index.ts"],
      "@brewform/shared/types": ["../../packages/shared/src/types/index.ts"],
      "@brewform/shared/schemas": ["../../packages/shared/src/schemas/index.ts"],
      "@brewform/shared/constants": ["../../packages/shared/src/constants/index.ts"],
      "@brewform/shared/utils": ["../../packages/shared/src/utils/index.ts"],
      "@brewform/shared/i18n": ["../../packages/shared/src/i18n/index.ts"]
    }
  }
}
```

**No source code changes expected** — Deno does type-checking, not `tsc`, so the `types: []` issue mainly affects editor/IDE experience. Deno's `deno check` uses Deno's own resolver, not TypeScript's.

#### Verification
- Editor/IDE: verify types resolve for vitest globals, react types, testing-library
- Run `deno task check` for all packages
- Confirm no new type errors appear

---

### 2.6 vite v6 → v8 (apps/web)

**PR**: [#23](https://github.com/Ardakilic/BrewForm/pull/23)  
**Confidence**: 7/10 (read Vite 8 changelog, scanned vite.config.ts)  
**Risk Level**: HIGH  
**Reversibility**: Reversible

#### Breaking Changes

1. **Rolldown replaces Rollup**: Vite 8 uses Rolldown internally. Your config uses no `rollupOptions` — safe
2. **Vite Environment API**: v8 introduces Environment API. Should be transparent for your SPA setup
3. **Compatibility layer**: Vite 8 auto-converts old `esbuildOptions` and `rollupOptions` to equivalent settings
4. **depType warning in Renovate dashboard**: `vite` can't be updated with a lock file `deno.lock` — manual intervention needed

#### Code Changes Required

**apps/web/vite.config.ts**:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@brewform/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
```

⚠ Vite 8 uses **Oxc** for React Refresh Transform and drops Babel from plugin-react. Your config has no Babel options — safe.

**apps/web/deno.json**:
```
"vite" is referenced as `npm:vite` in deno tasks — update should be automatic
```

#### Verification
- Run `deno task build` (apps/web) — must succeed
- Verify dev server works: `deno task dev` (from apps/web)
- Verify production build output is correct
- Check for any console warnings about deprecated options

---

### 2.7 @vitejs/plugin-react v4 → v6 (apps/web)

**PR**: [#16](https://github.com/Ardakilic/BrewForm/pull/16)  
**Confidence**: 8/10 (CodeRabbit verified, scanned vite.config.ts)  
**Risk Level**: MEDIUM  
**Requires**: vite v8 (dependency — must be upgraded together)

#### Breaking Changes

1. **Babel removed**: v6 drops internal Babel in favor of Oxc
2. **Requires Vite 8+**: v6 is designed for Vite 8
3. **No Babel options in config**: Your `vite.config.ts` uses `react()` with no options — safe

#### Code Changes Required

**None.** Your config is the simplest possible: `plugins: [react(), tailwindcss()]`

#### Verification
- Upgrade together with vite v8 — must be in same PR
- Run `deno task build` for web
- Verify HMR still works in dev mode

---

### 2.8 vitest v3 → v4 + @vitest/coverage-v8 (apps/web)

**PR**: [#26](https://github.com/Ardakilic/BrewForm/pull/26)  
**Confidence**: 6/10 (read vitest v4 release notes — limited)  
**Risk Level**: MEDIUM  
**Reversibility**: Reversible

#### Breaking Changes (Vitest 4.1)

1. **New APIs**: `aroundEach`, `aroundAll`, `test.extend`, tags, `mockThrow`
2. **Deprecated**: Several `vitest/*` entry points, `browser.isolate`, `waitOne`/`waitAll`
3. **Global imports**: Tests already import from `'vitest'` directly (not relying on globals) — safe
4. **`@testing-library/jest-dom`** should remain compatible
5. **`fast-check` v4** (see section 2.9) must be compatible with vitest v4

#### Code Changes Required

**Config files**:
| File | Changes |
|------|---------|
| `apps/web/vitest.config.ts` | No changes expected — vitest v4 maintains backward compat |
| `apps/web/vitest.pbt.config.ts` | May need update — property-based test config |

**Test files**: No changes expected for basic assertions. Watch for:
- `vi.mock()` behavior changes
- Soft assertion behavior changes
- `expect.poll()` timing changes

#### Verification
- Run all web tests: `deno run -A npm:vitest run`
- Run property-based tests: `deno run -A npm:vitest --config vitest.pbt.config.ts run`
- Check for deprecation warnings in test output
- Ensure coverage reporting still works

---

### 2.9 fast-check v3 → v4 (apps/web — property-based tests)

**PR**: [#18](https://github.com/Ardakilic/BrewForm/pull/18)  
**Confidence**: 5/10 ⚠ Unverified (limited codebase exposure)  
**Risk Level**: MEDIUM  
**Reversibility**: Reversible

#### Breaking Changes (v4.0.0)

1. **Removed deprecated APIs**: `uuidV`, `unicodeJson*`, `ascii*`, `hexa*`, `base64`, `stringOf`, `char16bits`, `string16bits`, `fullUnicode*`, `unicode*`, `char`, `big{U\|}int{N\|}`, `.noBias`, `.noShrink`
2. **Invalid dates included by default**
3. **Error with cause by default**
4. **Null-prototype by default in record/dictionary**
5. **Node >=12.17.0 required** (Deno is fine)
6. **New APIs**: `entityGraph`, `chainUntil`, `fc.map`, `fc.set`, `stringMatching` enhancements

#### Code Changes Required

**File**: `apps/web/vitest.pbt.config.ts` — check if any configuration changes needed

Search for fast-check usage:
```bash
rg -rn "fc\." "apps/web" --type ts --type tsx
rg -rn "fast-check" "apps/web" --type ts --type tsx
```

Common replacements (v3 → v4):
- `fc.uuidV4()` → `fc.uuid()` (built-in v4)
- `fc.hexaString()` → `fc.string({ unit: 'hex' })`
- `fc.fullUnicodeString()` → `fc.string()` (default)
- `fc.char16bits()` → `fc.string({ unit: 'binary' })`

#### Verification
- Run property-based tests: `deno run -A npm:vitest --config vitest.pbt.config.ts run`
- Check for deprecation warnings

---

### 2.10 @base-ui-components/react → @base-ui/react (apps/web)

**Status**: Deprecated package replacement  
**Confidence**: 7/10 (Renovate dashboard + npm registry check)  
**Risk Level**: MEDIUM  
**Reversibility**: Reversible

#### What Changed

`@base-ui-components/react` (v1.0.0-alpha.7 → v1.0.0-rc.0 in lockfile) is deprecated.
Replacement: `@base-ui/react` (new package name, same origin — MUI Base UI).

#### Code Changes Required

1. **Update import paths**: All files importing from `@base-ui-components/react` must change to `@base-ui/react`
2. **Check API surface**: The migrated package may have slight API differences
3. **Search for all usages**:
   ```bash
   rg -rn "@base-ui-components/react" "apps/web" --type ts --type tsx
   ```

**Files to audit**:
- Search for: `from '@base-ui-components/react'` imports
- Check all component imports (Dialog, Popover, Select, etc.)
- Verify prop interfaces haven't changed

#### Verification
- Search and replace all `@base-ui-components/react` imports with `@base-ui/react`
- Run `deno task check` for apps/web
- Run `deno task build` for web
- Manually test all components that use Base UI

---

### 2.11 Minor/Non-Breaking Updates

| Package | Update | Action |
|---------|--------|--------|
| hono | 4.12.18 → 4.12.19 (pending in dashboard) | Update package.json constraint `^4.7.0` is fine, lockfile resolves latest |
| react-router | 7.15.0 → 7.15.1 (pending in dashboard) | Update package.json constraint `^7.5.0` is fine, lockfile resolves latest |
| tailwindcss | 4.3.0 → latest within ^4.1.0 | lockfile updates automatically |
| @tailwindcss/vite | 4.3.0 → latest within ^4.1.0 | lockfile updates automatically |
| react / react-dom | 19.2.6 → latest within ^19.1.0 | lockfile updates automatically |
| drizzle-orm | 0.45.2 → latest within ^0.45.0 | lockfile updates automatically |
| postgres | 3.4.9 → latest within ^3.4.5 | lockfile updates automatically |

---

## 3. Deprecated Package Replacements

| Deprecated | Replacement | Action |
|-----------|-------------|--------|
| `@base-ui-components/react` | `@base-ui/react` | Update `apps/web/package.json` and all imports |
| `@types/bcryptjs` | (none — bcryptjs v3 has built-in types) | Remove from `apps/api/package.json` devDependencies |

---

## 4. Interdependency Ordering

### Critical Dependency Chains

```
Tree A: Vite ecosystem (must go together)
  vite@8 ← @vitejs/plugin-react@6
  vite@8 ← vitest@4 (vitest v4 depends on Vite 8)
  vite@8 ← @vitest/coverage-v8@4

Tree B: Zod ecosystem (must go together)
  zod@4 ← @hono/zod-validator (check peer deps)
  zod@4 ← hono-openapi (check compat)

Tree C: Independent
  pino@10 (no deps on other upgrades)
  mjml@5  (no deps on other upgrades)
  bcryptjs@3 (no deps on other upgrades — but remove @types/bcryptjs)
  fast-check@4 (no deps on other upgrades)
  TypeScript@6 (independent — only affects type-checking)

Tree D: Shared packages (affected by zod@4)
  packages/shared (zod schemas) ← apps/api (consumes schemas)
  packages/shared (zod schemas) ← apps/web (consumes schemas)
```

### Recommended Execution Order

1. **TypeScript 6** — update first so new defaults are visible during rest of work
2. **zod v4 + @hono/zod-validator check** — most impactful change, fix schemas
3. **bcryptjs v3 + remove @types/bcryptjs** — independent
4. **pino v10** — independent
5. **vite v8 + @vitejs/plugin-react v6** — together
6. **vitest v4 + @vitest/coverage-v8 v4** — after vite
7. **fast-check v4** — after vitest (tests need running env)
8. **mjml v5 + regenerate templates** — independent
9. **@base-ui-components/react → @base-ui/react** — independent
10. **React Router / Hono minor bumps** — lockfile auto-resolve

---

## 5. Lockfile Update Instructions

Since this is a Deno-only project:

```bash
# 1. Update all package.json files with new versions (manual edits)
#    - apps/api/package.json
#    - apps/web/package.json
#    - packages/db/package.json
#    - packages/shared/package.json

# 2. Update the deno.lock
deno install --allow-all

# 3. Alternatively, force update specific packages:
deno cache --reload npm:zod@4.4.3
deno cache --reload npm:vite@8.0.13
# ... etc

# 4. Or just run deno cache with all imports:
deno task check  # this resolves and caches all dependencies

# 5. The deno.lock will be automatically regenerated
```

⚠ **Renovate warning**: `depType: "tasks", depName: "vite" can't be updated with a lock file: "deno.lock"` — This means Vite is referenced in deno.json tasks (`deno run -A npm:vite`), not just in package.json. After updating package.json, the lockfile must be manually updated via `deno install`.

---

## 6. Package.json Changes (Exact Diffs)

### apps/api/package.json

```diff
  "dependencies": {
    "drizzle-orm": "^0.45.0",
-   "zod": "^3.24.0",
+   "zod": "^4.0.0",
    "hono": "^4.7.0",
    "@hono/zod-validator": "^0.8.0",
    "@hono/standard-validator": "^0.2.0",
    "hono-openapi": "^1.0.0",
-   "pino": "^9.6.0",
+   "pino": "^10.0.0",
    "pino-pretty": "^13.0.0",
    "date-fns": "^4.1.0",
-   "bcryptjs": "^2.4.3",
+   "bcryptjs": "^3.0.0",
    "qrcode": "^1.5.4",
    "nodemailer": "^8.0.6"
  },
  "devDependencies": {
-   "mjml": "^4.15.0",
+   "mjml": "^5.0.0",
-   "@types/bcryptjs": "^2.4.6",
    "@types/qrcode": "^1.5.5",
    "@types/nodemailer": "^8.0.0",
    "@std/testing": "jsr:@std/testing@^1.0.18",
    "@std/expect": "jsr:@std/expect@^1.0.19"
  }
```

### apps/web/package.json

```diff
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router": "^7.5.0",
-   "@base-ui-components/react": "^1.0.0-alpha.7"
+   "@base-ui/react": "^1.0.0-alpha.7"
  },
  "devDependencies": {
-   "vite": "^6.3.0",
+   "vite": "^8.0.0",
-   "@vitejs/plugin-react": "^4.4.0",
+   "@vitejs/plugin-react": "^6.0.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
-   "typescript": "^5.8.0",
+   "typescript": "^6.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
-   "vitest": "^3.2.0",
+   "vitest": "^4.0.0",
-   "@vitest/coverage-v8": "^3.2.0",
+   "@vitest/coverage-v8": "^4.0.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@testing-library/jest-dom": "^6.6.3",
    "jsdom": "^29.0.0",
-   "fast-check": "^3.22.0"
+   "fast-check": "^4.0.0"
  }
```

### packages/db/package.json

```diff
  "dependencies": {
    "drizzle-orm": "^0.45.0",
    "postgres": "^3.4.5",
-   "bcryptjs": "^2.4.3"
+   "bcryptjs": "^3.0.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "@std/testing": "jsr:@std/testing@^1.0.18",
    "@std/expect": "jsr:@std/expect@^1.0.19"
  }
```

### packages/shared/package.json

```diff
  "dependencies": {
-   "zod": "^3.24.0",
+   "zod": "^4.0.0",
    "date-fns": "^4.1.0"
  }
```

---

## 7. Code Changes Summary

| File(s) | Change | Reason |
|---------|--------|--------|
| `packages/shared/src/schemas/*.ts` (17+ files) | Zod v4 API migration | zod v4 breaking changes |
| `apps/api/src/modules/*/index.ts` (if needed) | Schema import/usage fixes | zod v4 breaking changes |
| `apps/api/src/modules/auth/model.ts` | Verify bcryptjs import | bcryptjs v3 ESM |
| `apps/api/src/modules/admin/model.ts` | Update bcryptjs import pattern | bcryptjs v3 ESM — consistency |
| `apps/api/src/setup.ts` | Update bcryptjs import pattern | bcryptjs v3 ESM — consistency |
| `apps/api/src/types/mjml.d.ts` | Update MjmlOptions interface | mjml v5 option changes |
| `apps/web/tsconfig.json` | Add `"types"` array, remove `"baseUrl"` | TypeScript 6 defaults |
| `apps/web/src/**/*.tsx` | Replace `@base-ui-components/react` imports | Deprecated package migration |
| `apps/web/vitest.pbt.config.ts` (if needed) | Check fast-check v4 compat | fast-check v4 breaking changes |
| All `package.json` files | Update version constraints | Per section 6 |
| `deno.lock` | Auto-regenerated | After `deno install` |

---

## 8. Post-Update Verification Checklist

Run in order:

```bash
# 1. Format check
deno fmt --check

# 2. Lint all workspace packages
deno lint apps/ packages/

# 3. Type-check all packages
deno task check

# 4. Full test suite (all workspace packages)
deno test --allow-all apps/api/src/ packages/shared/src/ packages/db/src/

# 5. Web tests (Vitest)
deno run -A npm:vitest run
deno run -A npm:vitest --config vitest.pbt.config.ts run

# 6. Web production build
deno task build  # runs apps/web build

# 7. Email template regeneration
deno task email-build

# 8. Visual email template verification
#    - Open each generated template in apps/api/src/templates/email/generated/
#    - Verify background-color (#F5F0EB) renders correctly
#    - Check layout in email testing tools (Litmus, Email on Acid, or manual send)

# 9. Dev server smoke test
deno run -A npm:vite --host 0.0.0.0 --port 5173
# Verify React components render, Tailwind styles apply, Base UI components work
```

**Success criteria**:
- ✅ `deno fmt --check` passes
- ✅ `deno lint` passes (0 warnings)
- ✅ `deno task check` passes (0 type errors)
- ✅ All Deno tests pass (0 failures)
- ✅ All Vitest tests pass (0 failures)
- ✅ `deno task build` succeeds (web production build)
- ✅ `deno task email-build` succeeds (mjml v5 templates generate)
- ✅ Email templates render correctly (visual check)
- ✅ Dev server starts and renders correctly

---

## 9. Rollback Strategy

### Full Rollback

```bash
# If the branch is not yet merged:
git checkout main
git branch -D renovate/all-deps-update

# If merged and issues found in production:
git revert <merge-commit-sha>
# Or reset the deno.lock to previous commit:
git checkout HEAD~1 -- deno.lock apps/*/package.json packages/*/package.json
deno install --allow-all
```

### Partial Rollback (per-package)

| Package | Rollback Command |
|---------|-----------------|
| zod | Revert zod version in package.json + `deno install` |
| pino | Revert pino version + `deno install` |
| bcryptjs | Revert bcryptjs + re-add @types/bcryptjs + `deno install` |
| mjml | Revert mjml version + re-run `deno task email-build` |
| TypeScript | Revert ts version in package.json |
| vite + plugin-react | Revert both together in package.json + `deno install` |
| vitest + coverage | Revert both together in package.json + `deno install` |
| fast-check | Revert fast-check version + `deno install` |
| @base-ui/react | Revert to @base-ui-components/react in package.json + imports + `deno install` |

### Irreversible Considerations

1. **bcryptjs hash format**: New users signing up after bcryptjs v3 will have `$2b$` hashes. If you roll back to v2, these hashes will NOT verify (bcryptjs v2 doesn't understand `$2b$` prefix). Mitigation: don't deploy to production before verifying rollback.

2. **mjml email templates**: Templates generated with v5 will have different HTML structure. Rolling back requires regenerating with v4.

3. **zod v4 schemas**: Schema files modified for v4 API may not work with v3. Keep the pre-update `packages/shared/src/schemas/` backed up.

---

## 10. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| zod v4 breaks all schemas | HIGH | HIGH | Full test suite; migrate schemas incrementally; check @hono/zod-validator compat FIRST |
| vite v8 build fails | MEDIUM | HIGH | Simple config — fallback: rollback vite+plugin-react together |
| mjml v5 email rendering broken | MEDIUM | MEDIUM | Visual check before deploy; keep mjml v4 generated templates as backup |
| bryptjs v3 import breaks in Deno | LOW | MEDIUM | Defensive import pattern already used in auth/model.ts |
| vitest v4 breaks existing tests | MEDIUM | MEDIUM | Run full test suite; vitest v4 maintains backward compat for basic APIs |
| fast-check v4 API mismatch | LOW | LOW | Limited fast-check usage in codebase |
| @base-ui/react imports break | MEDIUM | MEDIUM | Search-and-replace import paths; manually test affected components |
| TypeScript 6 IDE issues | LOW | LOW | Deno uses its own checker; only affects editor experience |
| pino v10 logging breaks | LOW | LOW | CodeRabbit confirmed no breaking changes in your usage |
| Lockfile generation failure | LOW | HIGH | `deno install --allow-all` should resolve — manual intervention if needed |

---

## 11. Timeline & Effort Estimate

| Phase | Work | Estimate |
|-------|------|----------|
| 1. Update package.json files | 4 file edits | 15 min |
| 2. Run deno install + lockfile | 1 command | 5 min |
| 3. Fix zod v4 schemas | 17+ files audit + fixes | 2-4 hours |
| 4. Fix bcryptjs imports | 3 files | 30 min |
| 5. Fix TS config + mjml types | 2 files | 15 min |
| 6. Replace @base-ui imports | grep + replace | 30 min |
| 7. Fix fast-check if needed | search + fix | 1 hour |
| 8. Regenerate email templates | 1 command | 5 min |
| 9. Full test suite run | CI verification | 30 min |
| 10. Visual email verification | Manual | 30 min |
| **Total estimated effort** | | **5-8 hours** |

---

## 12. References

- Renovate Dashboard: https://github.com/Ardakilic/BrewForm/issues/8
- Open Renovate PRs: https://github.com/Ardakilic/BrewForm/pulls/app%2Frenovate
- zod v4 docs: https://zod.dev
- TypeScript 6 release notes: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- Vite 8 changelog: https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md
- Vitest 4 changelog: https://github.com/vitest-dev/vitest/releases
- pino v10 changelog: https://github.com/pinojs/pino/releases
- mjml v5 release notes: https://github.com/mjmlio/mjml/releases
- bcryptjs v3 release notes: https://github.com/dcodeIO/bcrypt.js/releases
- fast-check v4 migration: https://fast-check.dev/docs/migration-guide/from-3.x-to-4.x/
