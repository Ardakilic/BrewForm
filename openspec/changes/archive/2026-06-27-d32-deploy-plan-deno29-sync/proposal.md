## Why

`d30` (Coolify + GHCR deployment) and `d31` (Deno 2.7.14 → 2.9.0 + workspace management)
landed back-to-back. `d30` authored the operator guide `coolify_deployment_plan.md` and the
production Docker/compose topology; `d31` then bumped the runtime to **2.9.0**, swapped the Docker
`deps` stages and CI to `deno ci`, and layered workspace-management features on top. The
deployment guide and a few local-dev infra details were **never reconciled** with `d31`, leaving
concrete drift between what the docs say and what the code does.

A cross-check of both changes against the working tree found:

1. **Dev Deno cache mounted at the wrong path.** The `denoland/deno:debian` image sets
   `DENO_DIR=/deno-dir` (the Dockerfiles correctly `COPY --from=… /deno-dir /deno-dir` between
   stages), but the dev compose services mount the `deno_cache` named volume at
   `/root/.cache/deno` — `compose.yml:50` (`app`) and `compose.yml:94` (`web-dev`). Deno writes to
   `/deno-dir` inside the container, so the named volume holds nothing useful and dependencies are
   re-fetched on every `docker compose down && up`. The cache volume is effectively a no-op in dev.
2. **`coolify_deployment_plan.md` is stale vs `d31`.** It pins `npm:drizzle-kit@0.31.10`
   (lines ~529, ~745) while the codebase pins `npm:drizzle-kit@0.31` (`Makefile:121` `DRIZZLE_KIT`,
   the `Dockerfile` builder stage, and `docker-entrypoint.sh`). It also never mentions the pinned
   Deno **2.9.0** runtime, the `deno ci` install used by Docker/CI, or the Deno workspace layout
   that the migrate/seed steps run inside.
3. **Caddy pin inconsistency.** `Dockerfile.web` pins `caddy:2.11.4-alpine` (the published
   production web image) while the compose preview `web` service floats `caddy:2-alpine`
   (`compose.yml:215`) — a reproducibility gap between local preview and production.
4. **Missing docblocks** on `d30`/`d31`-era scripts (`packages/db/src/seed.ts`,
   `packages/shared/src/workspace.test.ts`, `scripts/generate-icons.ts` lack module docblocks; the
   `escapeBackticks` helper in `apps/api/scripts/build-email-templates.ts` lacks a function docblock).
5. **`d31` close-out leftover** (its task §14.1, 49/50): close superseded PR #54 and delete the
   stale `feat/workspace-management` branch.

### Verified NON-issues (investigated, no change needed — recorded so they are not re-litigated)

- **`--unstable-cron` / `--unstable-kv` are still required on 2.9.** Confirmed via the Deno docs:
  `Deno.cron` and Deno KV remain unstable in 2.9 and require the flags (or the `deno.json`
  `"unstable"` array). The entrypoint flags and the plan's references are correct.
- **`.dockerignore` `.env` exclusion is intact** (`.env`, `*.env`, `**/*.env` excluded;
  `*.env.example` re-included) — `d30`'s "no secrets in images" requirement holds.
- **Deno `2.9.0` and `deno ci` are already consistent** across both Dockerfiles and both CI
  workflows — `d31` applied these correctly; nothing to fix there.
- **The Makefile dash → colon target rename was considered and dropped.** GNU Make 3.81 (the
  developer's `make`) cannot parse a bare-colon target name (`serena:index:` errors with `target
  pattern contains no '%'` — it is read as a static pattern rule). A backslash-escaped form
  (`serena\:index:`, invoked as `make serena:index`) does work, but was judged not worth the
  Makefile noise and `help`-target rewrite. The existing dash-separated targets are kept as-is, so
  the plan's `prod-up` / `images-push` references remain accurate. See `design.md` Decision 2.

## What Changes

- **Fix the dev Deno cache mount** — `compose.yml` `app` and `web-dev` services: mount the
  `deno_cache` named volume at `/deno-dir` (the image `DENO_DIR`) instead of `/root/.cache/deno`,
  so the dev dependency cache actually persists across container recreation.
- **Pin the compose preview Caddy image** — `compose.yml` `web` (preview) service:
  `caddy:2-alpine` → `caddy:2.11.4-alpine`, matching the pinned production `Dockerfile.web` base.
- **Reconcile `coolify_deployment_plan.md` with `d31`**:
  - `npm:drizzle-kit@0.31.10` → `npm:drizzle-kit@0.31` (match `Makefile`/`Dockerfile`/entrypoint).
  - Add the pinned Deno **2.9.0** runtime to the prerequisites/pre-flight section and note the
    `denoland/deno:debian-2.9.0` base images.
  - Note that Docker `deps` stages and CI install via `deno ci` (frozen) wherever the guide
    references building/rebuilding images.
  - Note the Deno workspace layout (root `deno.json` `workspace.members`, `apps/*` + `packages/*`)
    where the guide describes the migrate/seed steps that run inside it.
  - Align any Caddy reference with the pinned `caddy:2.11.4-alpine`.
- **Add missing docblocks** — module docblocks for `packages/db/src/seed.ts`,
  `packages/shared/src/workspace.test.ts`, and `scripts/generate-icons.ts`; a function docblock for
  `escapeBackticks()` in `apps/api/scripts/build-email-templates.ts`.
- **Add a hermetic infra guard test** — a Deno test asserting the dev `deno_cache` mounts at
  `/deno-dir` (and not the old path) and that the preview Caddy image is pinned, so this drift
  cannot silently regress.
- **Close out `d31`** — close PR #54 and delete the stale branch (tracked here for completeness;
  ownership stays with `d31` §14.1).

## Capabilities

### New Capabilities

- `local-dev-environment`: The Docker Compose dev profile persists the Deno dependency cache at the
  image's `DENO_DIR` (`/deno-dir`) so the `deno_cache` volume is effective across container
  recreation, and compose image references are version-pinned for reproducibility with the
  published images. A hermetic test guards both invariants.
- `deployment-guide`: The operator deployment guide (`coolify_deployment_plan.md`) accurately
  reflects the current build/runtime reality established by `d31` — the pinned Deno 2.9.0 base
  images, the `deno ci` frozen install, the Deno workspace layout the migrate/seed steps run in,
  and the `npm:drizzle-kit@0.31` pin used by the codebase.

### Modified Capabilities

None as formal main specs. This change **touches** files owned by `d30`'s `container-deployment`
capability (`compose.yml`, the Caddy image pin) and `d30`'s deployment guide, but the changes are
corrective/additive: they fix a non-functional dev cache mount, pin a floating preview image, and
align documentation with code. They do not alter `d30`'s deployment behavior, image topology,
entrypoint, or the `denokv` sidecar, nor `d31`'s runtime version or `deno ci` adoption.

## Impact

- **compose.yml**: `app` + `web-dev` `deno_cache` mount → `/deno-dir`; preview `web` image →
  `caddy:2.11.4-alpine`.
- **coolify_deployment_plan.md**: drizzle-kit pin reconciled; Deno 2.9.0 / `deno ci` / workspace
  layout notes added; Caddy reference aligned.
- **packages/db/src/seed.ts**: `+ module docblock`.
- **packages/shared/src/workspace.test.ts**: `+ module docblock`.
- **scripts/generate-icons.ts**: `+ module docblock`.
- **apps/api/scripts/build-email-templates.ts**: `+ docblock` on `escapeBackticks()`.
- **packages/shared/src/** (new test): hermetic compose-config guard test (text-based assertions,
  no new dependency).
- **No application logic changes** — no API/runtime behavior changes.
- **No database schema changes.**

## Non-Goals

- **Renaming Makefile targets to colon form** — GNU Make 3.81 is incompatible with bare-colon
  target names; the existing dash targets are kept. (See `design.md` Decision 2.)
- **Re-doing `d31`** — no change to the Deno version, the `deno ci` adoption, the catalog,
  member `version` fields, `bump:*` tasks, or sanitizers. Those are `d31`'s and are correct.
- **Changing deployment behavior** — the entrypoint, `--unstable-cron`/`--unstable-kv` flags, the
  `denokv` sidecar, GHCR publishing (`release.yml`), and the compose `prod` profile are unchanged.
- **Rewriting historical records** — `openspec/changes/archive/**`, completed `plans/*.md`, and the
  other in-flight changes (`d27`, `d29`) are left as-is; they describe what was true at the time.
- **No dependency version upgrades** and **no new runtime dependency** (the guard test uses
  text-based assertions, not a YAML parser).
