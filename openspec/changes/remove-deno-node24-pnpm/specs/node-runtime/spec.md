# node-runtime

## ADDED Requirements

### Requirement: Node 24 LTS runtime contract
The API SHALL run on Node 24 LTS (`node:24-bookworm-slim`, `.nvmrc` `24`, `engines/devEngines` pinned). Only erasable TypeScript syntax SHALL be used (`erasableSyntaxOnly:true`); `Deno.*` namespaces, `jsr:`/`npm:` specifiers, and `--unstable-*` flags SHALL NOT exist in `apps/`, `packages/`, `scripts/`, Docker, or CI (excluding this change's own docs).

---
#### Scenario: No Deno remnants
- **WHEN** grepping `apps/ packages/ scripts/ Dockerfile* compose.yml .github/ Makefile` for `Deno\.|jsr:|denoland|DENO_|deno task`
- **THEN** zero matches are returned.

### Requirement: Hono server bootstrap
The API SHALL bootstrap via `@hono/node-server` `serve({ fetch: app.fetch, port })` with `process.env` configuration. `Deno.serve` SHALL NOT exist.

---
#### Scenario: Server starts
- **WHEN** the runner executes `tsx src/main.ts` (via pnpm)
- **THEN** the Hono app serves on the configured port.

### Requirement: Cache without Deno KV
The default `CacheProvider` SHALL be memory-backed with no `Deno.Kv` type or `DENO_KV_*` env dependency. The `denokv` sidecar SHALL NOT exist in `compose.yml` or Coolify docs.

---
#### Scenario: Cache in production without KV sidecar
- **WHEN** `CACHE_DRIVER=memory` and no KV service runs
- **THEN** reads/writes succeed without persistence guarantees.

### Requirement: In-process cron without Deno.cron
Badge evaluation SHALL run on `0 * * * *` via `node-cron` (or equivalent in-process scheduler). `Deno.cron` SHALL NOT exist.

---
#### Scenario: Hourly badge job fires
- **WHEN** the scheduler ticks at minute 0
- **THEN** badge evaluation executes once.
