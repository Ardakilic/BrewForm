## ADDED Requirements

### Requirement: The wave-5 safe batch moves every flagged dependency to its verified target

The wave-5 refresh SHALL land the following bumps (one `deno update --latest` sweep plus the two
explicit range edits), per `openspec/changes/wave-5-debt-clearance/audit/dependency-audit.md`:

| Package | From → To | Notes |
|---|---|---|
| `hono` | ^4.12.27 → 4.12.30 | patch |
| `hono-openapi` | ^1.3.0 → 1.3.1 | patch |
| `@hono/standard-validator` | ^0.2.2 → 0.2.3 | in-range patch; **0.3.0 is skipped** (hono-openapi@1.3.1 peer pins `^0.2.0`) |
| `@hono/zod-validator` | ^0.8.0 → 0.9.0 | range edit at `apps/api/package.json:9`; type-only `InferInput` change, hono ≥4.11.2 satisfied |
| `@std/expect` (jsr) | ^1.0.19 → 1.0.20 | apps/api + packages/db |
| `vitest` + `@vitest/coverage-v8` | ^4.1.9 → 4.1.10 | patch |
| `vite` | ^8.1.0 → 8.1.5 | patch |
| `tailwindcss` + `@tailwindcss/vite` | ^4.3.1 → 4.3.3 | patch |
| `nodemailer` | ^9.0.1 → 9.0.3 | patch |
| `fast-check` | ^4.8.0 → 4.9.0 | minor |
| `mjml` | ^5.3.0 → 5.4.0 | minor — re-run `deno task email-build` and eyeball the regenerated templates |
| `react-router` | ^8.0.1 → 8.2.0 | minor on v8 |

Explicit skips: `@hono/standard-validator` 0.3.0 (peer violation; revisit when hono-openapi widens
its peer range) and `@opencode-ai/plugin` (local tooling outside the Deno workspace). Floors and
`deno.lock` move together per the existing manifest-floor requirement.

**Reason:** All 15 `deno outdated` findings are patch/minor with verified release notes; batching
them keeps the audit surface one PR wide. The two skips are deliberate and documented so the next
audit doesn't re-litigate them.

#### Scenario: Outdated scan is clean after the batch

- **WHEN** `deno outdated --recursive` runs after the refresh
- **THEN** no package is flagged except the documented skips (`@hono/standard-validator` 0.3.0
  out-of-range latest) and `typescript` 7.x if the TS7 gate deferred

#### Scenario: The full pipeline passes on the new set

- **WHEN** `deno task ci` runs after the batch (suites run individually per the verification
  protocol)
- **THEN** check, lint, and all test suites pass, and the mjml email build has been re-run with
  its output committed

### Requirement: TypeScript 7 adoption is gated by a verification protocol with an explicit defer path

The `typescript` 6.0.3 → 7.0.2 (tsgo, MAJOR) bump SHALL only land if ALL of the following pass on
a branch, executed as the final section of the dependency track:

1. `deno run -A npm:typescript/tsc` resolves and runs under 7.0.2 (native-binary shim through Deno
   node-compat), exercising the exact flags the web check task uses: `--noEmit`, `-p`,
   `ignoreDeprecations`.
2. Its diagnostic list on `apps/web` is diffed against 6.0.3 — parity means the same errors (zero
   today) and no new false positives.
3. The resulting compiler skew (web checks on 7.0.2/tsgo; `deno check` on api/db/shared uses
   Deno 2.9's bundled TS 6.0.3) is documented in the dependency notes.

The fallback is a first-class outcome, not an escape hatch: if any step fails, the floor SHALL
stay `^6.0.3`, a new ledger item SHALL record the failure evidence, and the rest of the
dependency track lands unchanged.

**Reason:** TS7 is the Go-native compiler with platform-native binaries; the npm-binary
resolution path under Deno node-compat is exactly where such a package can break, and BrewForm's
only consumer is `apps/web/deno.json:8`. The gate makes the go/no-go objective (design.md
Decision 1).

#### Scenario: Gate passes and the bump lands

- **WHEN** all three verification steps pass on the branch
- **THEN** `apps/web/package.json` declares `typescript` `^7.0.2`, `deno task check:web` is green
  under tsgo, and the compiler-skew note exists in the dependency notes

#### Scenario: Gate fails and the defer path executes

- **WHEN** any verification step fails (resolution error, flag unsupported, diagnostic drift)
- **THEN** the floor remains `^6.0.3`, a new ledger item records which step failed with evidence,
  and no other dependency change is blocked by the failure

### Requirement: Renovate covers the catalog pins and the CI Deno version

`renovate.json` (currently bare `extends: ["config:recommended"]`) SHALL gain `customManagers`
covering the two verified blind spots:

1. **Root `deno.json` catalog pins** (`deno.json:8-10`: `drizzle-orm`, `bcryptjs`, `zod`) —
   `catalog` is not in the Renovate deno manager's supported depTypes, and the npm manager skips
   `catalog:` references.
2. **CI `deno-version` inputs** (`.github/workflows/ci.yml:17,76`,
   `.github/workflows/pr.yml:15,46,96,144`) — the github-actions manager bumps the
   `denoland/setup-deno@v2` action ref but never the `deno-version` input value, which is how the
   v2.9.0 drift happened. Use a regex customManager with a github-releases datasource (or switch
   the workflows to `deno-version-file`).

The third blind spot — `jsr:` protocol versions inside `package.json` files
(`apps/api/package.json:22-23`, `packages/db/package.json:22-23`) — SHALL be documented in
`renovate.json` (comment) or the dependency notes as unverified Renovate territory, to be checked
after the first post-change Renovate run.

**Reason:** Renovate silently not watching a pin is worse than no Renovate — the CI Deno drift
proved it. The customManagers close the two mechanisable gaps; the jsr gap is documented because
its manager behaviour is undocumented upstream.

#### Scenario: Catalog bump is proposed by Renovate

- **WHEN** a new `zod`/`drizzle-orm`/`bcryptjs` version is published after the change
- **THEN** Renovate opens a PR that edits the root `deno.json` catalog pin (not just a lockfile)

#### Scenario: CI Deno version is proposed by Renovate

- **WHEN** a new Deno release is published
- **THEN** Renovate opens a PR updating every `deno-version:` input in `ci.yml` and `pr.yml`

#### Scenario: The jsr blind spot is documented

- **WHEN** `renovate.json` or the dependency notes are inspected
- **THEN** the jsr-in-package.json limitation is recorded with the affected file:line references

## MODIFIED Requirements

### Requirement: drizzle-kit tracks the latest stable 0.31 line

`drizzle-kit` SHALL be kept current at its latest **stable** release on the `0.31` line
(`0.31.10` as of 2026-06-27), with a SINGLE authoritative version source:
`packages/db/package.json` SHALL declare `^0.31.10` and the lockfile SHALL resolve `drizzle-kit`
to that version. The five task commands in `packages/db/deno.json` (`:9-13`) SHALL NOT carry an
independent duplicate pin: they SHALL invoke drizzle-kit so that the version resolves through the
`package.json` declaration + lockfile (e.g. `npm:drizzle-kit` without a second version literal),
eliminating the two-place pin found by the 2026-07-19 audit. The `drizzle-kit` `1.0.0` line
(published only as `beta`/`rc` dist-tags) SHALL NOT be adopted — it is a pre-release, and the
tool runs in the deployment entrypoint. The deployment-surface `@0.31` minor-line pins
(`Makefile` `DRIZZLE_KIT`, `docker-entrypoint.sh`, the Dockerfile builder, and the deployment
guide) remain unchanged — they are governed by the deployment-pin decoupling requirement, not by
this refresh. A future `1.0` adoption is a separate, coordinated change that must update all
pinned surfaces together.

#### Scenario: drizzle-kit has one version source in the db package

- **WHEN** `packages/db/package.json` and `packages/db/deno.json` are compared
- **THEN** only `package.json` declares the drizzle-kit version (`^0.31.10`); the deno.json task
  strings contain no second version pin, and `deno task --cwd packages/db db-generate` still runs
  the locked 0.31.x

#### Scenario: No pre-release adopted and deployment pins untouched

- **WHEN** the repo is grepped for `drizzle-kit` after the change
- **THEN** no `1.0.0-rc`/`1.0.0-beta` pin exists anywhere, and the Makefile/entrypoint/Dockerfile
  deployment pins are byte-unchanged
