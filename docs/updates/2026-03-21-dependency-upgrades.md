# 2026-03-21 — Dependency Upgrades & Tooling Fixes

## Summary

Full dependency upgrade across the monorepo (`apps/api` and `apps/web`), pnpm upgrade from v9.15.0 to v10.32.1, and resolution of peer dependency warnings introduced by `baseui`'s outdated transitive dependencies.

---

## Problems Solved

### 1. Peer dependency warnings from `baseui`

After upgrading to React 19, `pnpm install` produced the following warnings on every install:

```
WARN  Issues with peer dependencies found
apps/web
└─┬ baseui 16.1.1
  ├─┬ react-map-gl 5.2.13
  │ └─┬ react-virtualized-auto-sizer 1.0.2
  │   ├── ✕ unmet peer react@"^15.3.0 || ^16.0.0-alpha": found 19.2.4
  │   └── ✕ unmet peer react-dom@"^15.3.0 || ^16.0.0-alpha": found 19.2.4
  ├─┬ react-uid 2.3.0
  │ ├── ✕ unmet peer react@^16.8.0: found 19.2.4
  │ └── ✕ unmet peer @types/react@^16.8.0: found 19.2.14
  └─┬ react-window 1.8.5
    ├── ✕ unmet peer react@"^15.0.0 || ^16.0.0": found 19.2.4
    └── ✕ unmet peer react-dom@"^15.0.0 || ^16.0.0": found 19.2.4
```

**Root cause:** `baseui` pulls in three transitive packages whose `peerDependencies` declarations were never updated for React 18/19, even though the packages themselves work fine with React 19:

| Package | Pinned by baseui | Declared peer React | Latest version | Updated peer React |
|---|---|---|---|---|
| `react-window` | `1.8.5` | `^15.0.0 \|\| ^16.0.0` | `2.2.7` | `^18.0.0 \|\| ^19.0.0` |
| `react-uid` | `2.3.0` | `^16.8.0` | `2.4.0` | `^16.8.0 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0` |
| `react-virtualized-auto-sizer` | `1.0.2` (via `react-map-gl@5.2.13`) | `^15.3.0 \|\| ^16.0.0-alpha` | `2.0.3` | `^18.0.0 \|\| ^19.0.0` |

**Fix:** Added `pnpm.overrides` to the root `package.json` to force the latest versions of these three packages throughout the entire dependency tree. This is the official pnpm mechanism for overriding transitive dependency versions — not a workaround.

```json
// package.json
"pnpm": {
  "overrides": {
    "react-virtualized-auto-sizer": "^2.0.3",
    "react-window": "^2.2.7",
    "react-uid": "^2.4.0"
  }
}
```

### 2. pnpm v10 build script security model

pnpm v10 introduced a breaking security change: **postinstall / preinstall scripts of dependencies no longer run by default.** They must be explicitly opted into via `onlyBuiltDependencies` in `pnpm-workspace.yaml`.

Without this, the following packages silently skip their required build scripts:

| Package | Required script | Effect if skipped |
|---|---|---|
| `@prisma/engines` | `postinstall` — downloads query engine binary | Prisma queries fail at runtime |
| `prisma` | `preinstall` — validates engine setup | Schema generation fails |
| `@prisma/client` | `postinstall` — generates typed client | TypeScript types unavailable |
| `@node-rs/argon2` | `postinstall` — selects native binary | Password hashing unavailable |
| `@biomejs/biome` | `postinstall` — downloads platform CLI | Linting/formatting unavailable |
| `esbuild` | `postinstall` — downloads platform binary | Bundling unavailable |

**Fix:** Added `onlyBuiltDependencies` to `pnpm-workspace.yaml`:

```yaml
# pnpm-workspace.yaml
onlyBuiltDependencies:
  - "@prisma/client"
  - "@prisma/engines"
  - prisma
  - "@node-rs/argon2"
  - "@biomejs/biome"
  - esbuild
```

### 3. `make test` failing when containers are not running

`make test` used `docker compose exec` for both `api` and `web`, which requires the target service to already be running. Running `make test` with only the API container up (the default dev state) produced:

```
docker compose exec web pnpm test
service "web" is not running
make: *** [test] Error 1
```

**Fix:** All test targets in `Makefile` (`test`, `test-api`, `test-web`, `test-coverage`, `test-watch`) switched from `docker compose exec` to `docker compose run --rm`. This spins up a temporary container on demand and removes it after the command finishes — no pre-running service required.

### 4. baseui v14 → v16 runtime breaking changes

The `baseui` upgrade from `14.0.0` to `16.1.1` introduced two runtime-breaking API changes that caused **32 out of 70 web tests to fail**.

#### 4a. `VARIANT` removed from `baseui/tag`

baseui v16 removed the `VARIANT` export from `baseui/tag` entirely. The tag styling API is now controlled exclusively via `HIERARCHY` (`primary` / `secondary`), which replaces the old `solid` / `outlined` / `light` values:

| Old (`VARIANT`) | New (`HIERARCHY`) |
|---|---|
| `VARIANT.solid` | `HIERARCHY.primary` |
| `VARIANT.outlined` | `HIERARCHY.secondary` |
| `VARIANT.light` | `HIERARCHY.secondary` |

Affected files: `RecipesPage.tsx`, `UserPage.tsx`, `TasteNoteAutocomplete.tsx`.

#### 4b. `Card.defaultProps` ignored by React 19

React 19 dropped support for `defaultProps` on function components. baseui v16's `Card` component relies on this pattern to provide two internal defaults:

```js
Card.defaultProps = {
  hasThumbnail,  // internal function, called as hasThumbnail(props) at render time
  overrides: {}
};
```

With React 19, `hasThumbnail` is `undefined` when not explicitly passed, causing every `<Card>` render to throw:

```
TypeError: hasThumbnail is not a function
  at Card (baseui/card/card.js:69)
```

**Fix:** A thin wrapper component was created at `src/components/Card.tsx` that supplies these defaults via standard parameter defaults (React 19–safe), and makes both props optional for callers:

```tsx
import { Card as BaseuiCard, hasThumbnail as defaultHasThumbnail } from 'baseui/card';
import type { CardProps } from 'baseui/card';

type Props = Omit<CardProps, 'hasThumbnail' | 'overrides'> & {
  hasThumbnail?: CardProps['hasThumbnail'];
  overrides?: CardProps['overrides'];
};

export function Card({ hasThumbnail = defaultHasThumbnail, overrides = {}, ...rest }: Props) {
  return <BaseuiCard hasThumbnail={hasThumbnail} overrides={overrides} {...rest} />;
}
```

All 14 page files that imported `Card` from `baseui/card` were updated to import from `../../components/Card` instead.

#### 4c. Tag close button `aria-label` changed

baseui v16 changed the accessible label on the Tag close/action button from `"close"` to `"Remove ${children}"`. Two tests in `RecipesPage.test.tsx` that queried `getAllByRole('button', { name: /close/i })` were updated to use `/remove/i`.

### 5. Docker containers not seeing root workspace config changes

The `docker-compose.yml` volume mounts only covered `apps/api`, `apps/web`, `packages`, and `node_modules`. The root `package.json` and `pnpm-workspace.yaml` were **baked into the Docker image at build time** and not reflected as live files. This meant:

- Changes to `pnpm.overrides` in `package.json` were invisible to running containers.
- Changes to `onlyBuiltDependencies` in `pnpm-workspace.yaml` were invisible too.
- A full image rebuild (`make build`) was required to pick up any root config changes.

**Fix:** Added volume mounts for both root config files to the `api` and `web` services in `docker-compose.yml`:

```yaml
volumes:
  - ./package.json:/app/package.json
  - ./pnpm-workspace.yaml:/app/pnpm-workspace.yaml
```

This ensures `pnpm install` (via `make install`) always reads the live host versions of these files without needing an image rebuild.

---

## Package Upgrades

### Root workspace (`package.json`)

| Package | Before | After |
|---|---|---|
| `@biomejs/biome` | `^1.9.4` | `^2.4.8` |
| `turbo` | `^2.3.3` | `^2.8.20` |
| `typescript` | `^5.7.2` | `^5.9.3` |
| `pnpm` (packageManager) | `9.15.0` | `10.32.1` |

### API (`apps/api/package.json`)

#### Dependencies

| Package | Before | After | Notes |
|---|---|---|---|
| `@hono/node-server` | `1.19.7` | `1.19.11` | |
| `@hono/zod-validator` | `0.4.3` | `0.7.6` | |
| `@prisma/client` | `6.19.1` | `7.5.0` | **Major** — see migration notes |
| `hono` | `4.11.1` | `4.12.8` | |
| `ioredis` | `5.8.2` | `5.10.1` | |
| `jose` | `5.10.0` | `6.2.2` | **Major** |
| `nanoid` | `5.1.6` | `5.1.7` | |
| `nodemailer` | `6.10.1` | `8.0.3` | **Major** |
| `pino` | `9.14.0` | `10.3.1` | **Major** |
| `pino-http` | `10.5.0` | `11.0.0` | **Major** |
| `slugify` | `1.6.6` | `1.6.8` | |
| `zod` | `3.25.76` | `4.3.6` | **Major** — see migration notes |

#### Dev Dependencies

| Package | Before | After |
|---|---|---|
| `@types/node` | `22.19.3` | `25.5.0` |
| `@types/nodemailer` | `6.4.21` | `7.0.11` |
| `@vitest/coverage-v8` | `2.1.9` | `4.1.0` |
| `prisma` | `6.19.1` | `7.5.0` |
| `vitest` | `2.1.9` | `4.1.0` |

### Web (`apps/web/package.json`)

#### Dependencies

| Package | Before | After | Notes |
|---|---|---|---|
| `@hookform/resolvers` | `3.10.0` | `5.2.2` | **Major** |
| `baseui` | `14.0.0` | `16.1.1` | **Major** |
| `i18next` | `24.2.3` | `25.10.2` | **Major** |
| `react` | `18.3.1` | `19.2.4` | **Major** |
| `react-dom` | `18.3.1` | `19.2.4` | **Major** |
| `react-helmet-async` | `2.0.5` | `3.0.0` | **Major** |
| `react-hook-form` | `7.69.0` | `7.71.2` | |
| `react-i18next` | `15.7.4` | `16.6.0` | **Major** |
| `react-router-dom` | `7.11.0` | `7.13.1` | |
| `swr` | `2.3.8` | `2.4.1` | |
| `zod` | `3.25.76` | `4.3.6` | **Major** — see migration notes |

#### Dev Dependencies

| Package | Before | After |
|---|---|---|
| `@testing-library/react` | `16.3.1` | `16.3.2` |
| `@types/react` | `18.3.27` | `19.2.14` |
| `@types/react-dom` | `18.3.7` | `19.2.3` |
| `@vitejs/plugin-react` | (implicit) | `6.0.1` |
| `@vitest/coverage-v8` | `2.1.9` | `4.1.0` |
| `jsdom` | `25.0.1` | `29.0.1` |
| `vite` | (implicit) | `8.0.1` |
| `vitest` | `2.1.9` | `4.1.0` |

---

## Files Changed

| File | Change |
|---|---|
| `package.json` | Added `pnpm.overrides`; `packageManager` auto-updated to `pnpm@10.32.1`; `@biomejs/biome` and `turbo` upgraded |
| `pnpm-workspace.yaml` | Added `onlyBuiltDependencies` for pnpm v10 build script approval |
| `docker-compose.yml` | Added volume mounts for `./package.json` and `./pnpm-workspace.yaml` on `api` and `web` services |
| `apps/api/Dockerfile` | Updated `corepack prepare pnpm@9.15.0` → `pnpm@10.32.1` (base + production stages) |
| `apps/web/Dockerfile` | Updated `corepack prepare pnpm@9.15.0` → `pnpm@10.32.1` |
| `apps/api/package.json` | All dependencies upgraded (see table above) |
| `apps/web/package.json` | All dependencies upgraded (see table above) |
| `Makefile` | All test targets (`test`, `test-api`, `test-web`, `test-coverage`, `test-watch`) switched from `docker compose exec` to `docker compose run --rm` |
| `apps/web/src/components/Card.tsx` | **New file.** Wrapper for baseui `Card` that restores `hasThumbnail` and `overrides` defaults dropped by React 19's removal of `defaultProps` support |
| `apps/web/src/pages/*/` (14 files) | `from 'baseui/card'` imports repointed to `from '../../components/Card'` |
| `apps/web/src/pages/recipes/RecipesPage.tsx` | `VARIANT` → `HIERARCHY` for all Tag `variant` props |
| `apps/web/src/pages/users/UserPage.tsx` | `VARIANT` → `HIERARCHY` for Tag `variant` props |
| `apps/web/src/components/TasteNoteAutocomplete.tsx` | `VARIANT` → `HIERARCHY` for Tag `variant` prop |
| `apps/web/src/pages/recipes/RecipesPage.test.tsx` | Updated close button queries from `/close/i` to `/remove/i` to match baseui v16 Tag aria-label |

---

## Migration Notes for Major Version Bumps

### baseui 14 → 16

**`VARIANT` removed from `baseui/tag`** — the `variant` prop on `Tag` no longer accepts `VARIANT.*` values. Replace all usages with `hierarchy={HIERARCHY.primary}` (solid/filled) or `hierarchy={HIERARCHY.secondary}` (outlined/light). Import `HIERARCHY` instead of `VARIANT`.

**`Card.defaultProps` incompatible with React 19** — baseui v16 still ships with `Card.defaultProps`, which React 19 silently ignores for function components. Any project rendering `<Card>` with React 19 must either pass `hasThumbnail` and `overrides` explicitly or use the wrapper at `src/components/Card.tsx` introduced in this update.

**Tag close button aria-label** — changed from `"close"` to `"Remove ${label}"`. Update any test selectors querying by the old label.


### Prisma 6 → 7

Prisma 7 ships with a new query engine and updated client API. Run `make db-generate` after upgrading to regenerate the Prisma client for the new version. Review the [Prisma 7 migration guide](https://www.prisma.io/docs/orm/more/upgrade-guides) for any breaking schema or query API changes.

### Zod 3 → 4

Zod 4 has several breaking changes including renamed methods and stricter type inference. Key changes to watch for:
- `z.string().nonempty()` is removed; use `z.string().min(1)` instead.
- `z.object().strict()` behavior changed.
- Custom error maps use a new API.
Review all Zod schemas in `apps/api/src` and `apps/web/src` after upgrading.

### React 18 → 19

React 19 removes several deprecated APIs and changes concurrent rendering behavior. Notable breaking changes:
- `ReactDOM.render()` removed (use `createRoot`).
- `string` refs removed.
- Various legacy lifecycle warnings become hard errors.
- `useFormState` renamed to `useActionState`.

### pino 9 → 10 / pino-http 10 → 11

pino v10 drops Node.js < 18 support and has changes to the transport API. Review custom pino transports and serializers.

### nodemailer 6 → 8

nodemailer v8 is a rewrite with ESM-first support and updated SMTP handling. Review transport configuration and attachment handling.

### jose 5 → 6

jose v6 has updated key import/export APIs and stricter algorithm handling. Review all JWT signing and verification calls.

---

## Remaining Deprecation Warnings (Non-Actionable)

The following `WARN deprecated subdependencies` warnings remain after the upgrade. They originate from inside `mapbox-gl@1.13.3`, which is a transitive dependency of `baseui` and cannot be updated independently:

- `core-js@2.6.12`
- `popper.js@1.16.1`
- `viewport-mercator-project@7.0.4`

These are cosmetic warnings only and do not affect runtime behaviour. They will resolve when `baseui` updates its `react-map-gl` dependency to a version using `mapbox-gl` v2+.
