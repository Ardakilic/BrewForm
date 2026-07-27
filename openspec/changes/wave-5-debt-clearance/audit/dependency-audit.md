# BrewForm Dependency Freshness Audit — 2026-07-19

Method: manifests read directly; `deno outdated --recursive` run at repo root (network OK); latest
versions for deps _not_ flagged by `deno outdated` cross-checked via `npm view <pkg> version`; Deno
latest stable from `https://dl.deno.land/release-latest.txt`; breaking-change notes from GitHub
release notes (honojs/middleware), Context7 (/microsoft/typescript-go, /honojs/middleware), and npm
package metadata.

## Runtime

| Item         | Current | Latest | Delta       | Notes                                                                                                       |
| ------------ | ------- | ------ | ----------- | ----------------------------------------------------------------------------------------------------------- |
| Deno (local) | 2.9.2   | 2.9.3  | patch       | `deno --version`; bundles TypeScript 6.0.3 for `deno check`                                                 |
| Deno (CI)    | v2.9.0  | 2.9.3  | patch drift | pinned at `.github/workflows/ci.yml:17,76` and `.github/workflows/pr.yml:15,46,96,144` — behind local 2.9.2 |

## Full dependency inventory

`catalog:` = resolved via root `deno.json` catalog (deno.json:7-11). "current" = at latest published
version as of 2026-07-19.

### Root deno.json catalog (deno.json:8-10)

| Dep         | Pinned  | Latest                         | Delta   |
| ----------- | ------- | ------------------------------ | ------- |
| drizzle-orm | ^0.45.2 | 0.45.2                         | current |
| bcryptjs    | ^3.0.3  | (not flagged by deno outdated) | current |
| zod         | ^4.4.3  | 4.4.3                          | current |

### Root package.json (package.json:19-21)

| Dep                   | Range  | Latest | Delta   |
| --------------------- | ------ | ------ | ------- |
| @resvg/resvg-js (dev) | ^2.6.2 | 2.6.2  | current |

### apps/api/package.json

| Dep                      | Range (line)                  | Latest                  | Delta                                     |
| ------------------------ | ----------------------------- | ----------------------- | ----------------------------------------- |
| drizzle-orm              | catalog: (6)                  | 0.45.2                  | current                                   |
| zod                      | catalog: (7)                  | 4.4.3                   | current                                   |
| hono                     | ^4.12.27 (8)                  | 4.12.30                 | patch                                     |
| @hono/zod-validator      | ^0.8.0 (9)                    | 0.9.0                   | 0.x minor (out of range)                  |
| @hono/standard-validator | ^0.2.2 (10)                   | 0.3.0 (in-range: 0.2.3) | patch in-range; 0.3.0 blocked (see below) |
| hono-openapi             | ^1.3.0 (11)                   | 1.3.1                   | patch                                     |
| pino                     | ^10.3.1 (12)                  | 10.3.1                  | current                                   |
| pino-pretty              | ^13.1.3 (13)                  | —                       | current (not flagged)                     |
| bcryptjs                 | catalog: (14)                 | —                       | current                                   |
| qrcode                   | ^1.5.4 (15)                   | —                       | current                                   |
| nodemailer               | ^9.0.1 (16)                   | 9.0.3                   | patch                                     |
| mjml (dev)               | ^5.3.0 (19)                   | 5.4.0                   | minor                                     |
| @types/qrcode (dev)      | ^1.5.6 (20)                   | —                       | current                                   |
| @types/nodemailer (dev)  | ^8.0.1 (21)                   | —                       | current                                   |
| @std/testing (dev)       | jsr:@std/testing@^1.0.19 (22) | —                       | current (not flagged)                     |
| @std/expect (dev)        | jsr:@std/expect@^1.0.19 (23)  | 1.0.20                  | patch                                     |

### apps/web/package.json

| Dep                               | Range (line)  | Latest | Delta     |
| --------------------------------- | ------------- | ------ | --------- |
| react                             | ^19.2.7 (6)   | 19.2.7 | current   |
| react-dom                         | ^19.2.7 (7)   | —      | current   |
| react-router                      | ^8.0.1 (8)    | 8.2.0  | minor     |
| @base-ui/react                    | ^1.6.0 (9)    | 1.6.0  | current   |
| vite (dev)                        | ^8.1.0 (12)   | 8.1.5  | patch     |
| @deno/vite-plugin (dev)           | ^2.0.2 (13)   | —      | current   |
| @vitejs/plugin-react (dev)        | ^6.0.3 (14)   | —      | current   |
| tailwindcss (dev)                 | ^4.3.1 (15)   | 4.3.3  | patch     |
| @tailwindcss/vite (dev)           | ^4.3.1 (16)   | 4.3.3  | patch     |
| typescript (dev)                  | ^6.0.3 (17)   | 7.0.2  | **MAJOR** |
| @types/react (dev)                | ^19.2.17 (18) | —      | current   |
| @types/react-dom (dev)            | ^19.2.3 (19)  | —      | current   |
| vitest (dev)                      | ^4.1.9 (20)   | 4.1.10 | patch     |
| @vitest/coverage-v8 (dev)         | ^4.1.9 (21)   | 4.1.10 | patch     |
| @testing-library/react (dev)      | ^16.3.2 (22)  | —      | current   |
| @testing-library/user-event (dev) | ^14.6.1 (23)  | —      | current   |
| @testing-library/jest-dom (dev)   | ^6.9.1 (24)   | —      | current   |
| jsdom (dev)                       | ^29.1.1 (25)  | —      | current   |
| fast-check (dev)                  | ^4.8.0 (26)   | 4.9.0  | minor     |

### packages/db/package.json

| Dep                | Range (line)                  | Latest  | Delta   |
| ------------------ | ----------------------------- | ------- | ------- |
| drizzle-orm        | catalog: (16)                 | 0.45.2  | current |
| postgres           | ^3.4.9 (17)                   | 3.4.9   | current |
| bcryptjs           | catalog: (18)                 | —       | current |
| drizzle-kit (dev)  | ^0.31.10 (21)                 | 0.31.10 | current |
| @std/testing (dev) | jsr:@std/testing@^1.0.19 (22) | —       | current |
| @std/expect (dev)  | jsr:@std/expect@^1.0.19 (23)  | 1.0.20  | patch   |

Also: packages/db/deno.json:9-13 hard-pins `npm:drizzle-kit@0.31` inside five task commands — a
second place the drizzle-kit version lives (duplication with packages/db/package.json:21).

### packages/shared/package.json

| Dep         | Range (line)  | Latest | Delta   |
| ----------- | ------------- | ------ | ------- |
| zod         | catalog: (12) | 4.4.3  | current |
| zod-openapi | ^6.0.0 (13)   | 6.0.0  | current |

### .opencode/package.json (outside Deno workspace; not scanned by `deno outdated`)

| Dep                 | Pin (line)  | Latest | Delta             |
| ------------------- | ----------- | ------ | ----------------- |
| @opencode-ai/plugin | 1.15.13 (3) | 1.18.3 | minor (exact pin) |

## `deno outdated --recursive` raw result (2026-07-19)

15 outdated packages: @hono/standard-validator 0.2.2→0.2.3 (latest 0.3.0), @hono/zod-validator 0.8.0
(latest 0.9.0), @jsr/std__expect 1.0.19→1.0.20, hono-openapi 1.3.0→1.3.1, @vitest/coverage-v8 +
vitest 4.1.9→4.1.10, hono 4.12.27→4.12.30, @tailwindcss/vite + tailwindcss 4.3.1→4.3.3, fast-check
4.8.0→4.9.0, mjml 5.3.0→5.4.0, typescript 6.0.3 (latest 7.0.2), vite 8.1.0→8.1.5, react-router
8.0.1→8.2.0, nodemailer 9.0.1→9.0.3. Everything not listed is at latest (spot-verified via npm view
for drizzle-orm, zod, react, postgres, drizzle-kit, zod-openapi, pino, @base-ui/react,
@resvg/resvg-js).

## Major / notable-bump migration notes (verified, not changelog noise)

### typescript 6.0.3 → 7.0.2 (MAJOR — careful)

- TS 7 is the Go-native compiler (tsgo). Per microsoft/typescript-go README feature matrix: program
  creation, parsing, tsconfig parsing, type resolution, and type checking are all "done" with "same
  errors, locations, and messages as TS 6.0"; watch mode is prototype; compiler API is "not ready"
  (neither is used here).
- Packaging changed: typescript@7.0.2 npm metadata shows `bin: {tsc: "bin/tsc"}` (tsserver bin
  removed) plus 20 platform-native `@typescript/typescript-*` packages as dependencies. `bin/tsc` is
  a JS shim that spawns the platform binary.
- BrewForm's only consumer is apps/web/deno.json:8:
  `deno run -A npm:typescript/tsc --noEmit -p tsconfig.json`. Under v7 this must spawn a native
  binary through Deno's node-compat — works in principle with `-A` + `nodeModulesDir: "auto"`
  (deno.json:6), but MUST be verified in a branch before merging.
- Skew caveat: Deno 2.9.2 bundles TS 6.0.3 for `deno check` (used by api/db/shared checks, e.g.
  apps/api/deno.json:9, packages/db/deno.json:15, packages/shared/deno.json:16). Bumping npm
  typescript to 7 makes apps/web type-check on a different compiler than the rest of the workspace
  until Deno itself ships TS 7. Diagnostics may differ ("printback in errors may display
  differently"; "not all resolution modes supported yet").
- Verdict: defer or trial-branch; zero urgency (6.0.3 still current for the 6.x line).

### @hono/zod-validator 0.8.0 → 0.9.0 (0.x range-breaking — trivially safe)

- Release note (honojs/middleware PR #2038): only change is "Use `InferInput` from `hono/validator`
  instead of a local copy" — type-level only; requires hono >=4.11.2 (repo has ^4.12.27 →
  satisfied).
- Repo has ~40 `zValidator(...)` call sites across apps/api/src/modules/*/index.ts and no Hono RPC
  client usage (`hc<`/`hono/client` grep: zero hits), so the InferInput change has no observable
  effect. Migration cost: edit range at apps/api/package.json:9 + `deno task check`.

### @hono/standard-validator 0.2.2 → 0.3.0 (0.x range-breaking — BLOCKED, skip)

- Same InferInput change (PR #2013), requires hono >=4.11.2.
- BUT hono-openapi@1.3.1 peerDependencies still pin `@hono/standard-validator: ^0.2.0` (verified via
  npm view) → 0.3.0 violates the peer range. The package is not imported anywhere in source (only
  declaration at apps/api/package.json:10, satisfying hono-openapi's optional peer —
  node_modules/hono-openapi/package.json peerDependenciesMeta).
- Take the in-range 0.2.3 patch instead (fixes hook `data` type + literal-union preservation, PR
  #2008); revisit 0.3.0 when hono-openapi widens its peer range.

### react-router 8.0.1 → 8.2.0 (minor — safe)

- Minor on the v8 line; repo uses library-mode SPA routing. RR minors are non-breaking per semver
  policy; no migration notes needed. In-range (`^8.0.1`), applied by plain `deno update`.

### hono 4.12.27 → 4.12.30, vite 8.1.0 → 8.1.5, vitest 4.1.9 → 4.1.10, tailwind 4.3.1 → 4.3.3

- All patch, all in-range. No action beyond `deno update` + CI run.

## Renovate coverage (renovate.json:1-6)

Config is minimal: `extends: ["config:recommended"]` — no customManagers, no packageRules. Renovate
DOES ship a `deno` manager (docs.renovatebot.com/modules/manager/deno/) that matches
`deno.json`/`deno.lock` and supports depTypes: `imports`, `scopes.*`, `tasks.*` (incl. the
`npm:drizzle-kit@0.31` pins in packages/db/deno.json:9-13), `compilerOptions.types`, `lint.plugins`,
plus package.json node-compat when a `deno.lock` sits next to it (root deno.lock exists).

Gaps found:

1. **`catalog` is NOT in the deno manager's supported depTypes list** → the three root catalog pins
   (deno.json:8-10: drizzle-orm, bcryptjs, zod) are a Renovate blind spot; the npm manager also
   skips `catalog:` references in package.json (pnpm catalogs are only read from
   pnpm-workspace.yaml).
2. **`jsr:` protocol versions inside package.json** (apps/api/package.json:22-23,
   packages/db/package.json:22-23) are not valid npm semver — the npm manager skips them;
   deno-manager handling of jsr-in-package.json is undocumented. Verify after first Renovate run; a
   customManagers regex is the reliable fix.
3. **CI Deno version input** (`deno-version: v2.9.0` at .github/workflows/ci.yml:17,76 and
   pr.yml:15,46,96,144): the github-actions manager bumps `denoland/setup-deno@v2` action refs but
   never the `deno-version` input value → already drifted (v2.9.0 vs local 2.9.2 vs latest 2.9.3).
   Needs a customManagers regex + github-releases datasource, or switch the workflows to
   `deno-version-file`.
4. `.opencode/package.json` (@opencode-ai/plugin exact-pinned 1.15.13, latest 1.18.3) is plain npm —
   Renovate's npm manager will PR it; harmless but noisy for tooling config.

## Batches

**Safe batch** (one `deno update --latest` sweep + `deno task ci`): hono 4.12.30, hono-openapi
1.3.1, @hono/standard-validator 0.2.3, @std/expect 1.0.20, vitest/@vitest/coverage-v8 4.1.10, vite
8.1.5, tailwindcss/@tailwindcss/vite 4.3.3, nodemailer 9.0.3, fast-check 4.9.0, mjml 5.4.0 (re-run
`deno task email-build`, eyeball output), react-router 8.2.0, @hono/zod-validator 0.9.0 (range edit
at apps/api/package.json:9; type-only change). Plus Deno 2.9.2→2.9.3 locally and CI pin
v2.9.0→v2.9.3.

**Careful batch**: typescript 6.0.3 → 7.0.2 only (native-binary packaging; verify
`deno task --cwd apps/web check` in a branch; accept deno-check-vs-tsc compiler skew).

**Skip**: @hono/standard-validator 0.3.0 (hono-openapi@1.3.1 peer pins ^0.2.0; package not directly
imported); @opencode-ai/plugin (local tooling, non-product).

Not performed: security-advisory scan (freshness audit only; no npm lockfile for `npm audit`, `deno`
has no audit command).
