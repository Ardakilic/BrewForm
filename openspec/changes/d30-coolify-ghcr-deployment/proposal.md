## Why

BrewForm is currently a Deno Deploy-first monorepo: the `Dockerfile` builds an API-only runtime image, the web SPA is served as loose `apps/web/dist` files via a host-mounted Caddy, and CI (`ci.yml`) builds and tests but never publishes images. There is no first-class, reproducible path to run the full stack on a self-hosted container platform. To deploy on a self-hosted **Coolify** instance, we need:

1. Two independently-buildable, registry-publishable Docker images — one for the API (`deno` runtime) and one for the web SPA (`caddy:2-alpine` serving pre-built static files).
2. A GitHub Actions workflow that builds and pushes both images to **GHCR** (`ghcr.io/ardakilic/brewform-api`, `ghcr.io/ardakilic/brewform-web`) on every push to `main` and on tags.
3. A production-oriented `compose.yml` that references the published images and can be used both locally (`docker compose up --build` for a local image build) and as a reference for the Coolify deployment.
4. A remote, shared cache backend (Deno KV via `denokv`) so the API container's cache survives restarts and matches the remote topology locally — with the existing `CACHE_DRIVER=memory` retained as the dev/test fallback.
5. Makefile targets that mirror the new build/publish flow and keep the existing dev workflow intact.
6. A comprehensive Coolify deployment plan documenting the server-side and panel-side steps.

## What Changes

- **New `Dockerfile.web`** — multi-stage build (deps → builder → runner) producing a `caddy:2-alpine` image with the compiled `apps/web/dist` and a production `Caddyfile` baked in. `VITE_API_URL` and `VITE_PUBLIC_APP_URL` are injected as `ARG`s at build time so the SPA talks to the API subdomain.
- **Refactored `Dockerfile`** (API) — add a final `runner` stage with an **entrypoint script** (`docker-entrypoint.sh`) that runs `drizzle-kit migrate` (always, idempotent) and the seed (guarded so it only runs when the DB is empty / on first boot), then `exec`s the API server. Add `--unstable-kv` to the runtime flags.
- **New `compose.yml`** structure — a single file with two profiles:
  - `dev` (unchanged behavior): source-mounted `app` + `web-dev` + infrastructure (postgres, mailpit, pgadmin, garage, denokv).
  - `prod`: `app` and `web` services referencing `ghcr.io/ardakilic/brewform-api:latest` and `ghcr.io/ardakilic/brewform-web:latest`, plus `denokv` and `postgres` (the latter optional — Coolify manages its own Postgres). The `prod` profile supports `docker compose --profile prod up --build` for local image builds.
- **Remote Deno KV via `denokv` sidecar** — add a `denokv` service to `compose.yml` (both profiles) using `ghcr.io/denoland/denokv:0.14.0` with a mounted volume and `--access-token`. Update `apps/api/src/main.ts:127` to call `Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512')` when `CACHE_DRIVER=deno-kv`, so the API talks to the sidecar. Same one-line change in `apps/api/scripts/flush-cache.ts`.
- **Split `.env.example` into three files** — `apps/api/.env.example` (API runtime env, paste into Coolify), `apps/web/.env.example` (web build-time vars, set as GitHub Secrets), and a slimmed root `.env.example` (local-dev infra only: Postgres, Garage, pgAdmin, denokv token). New `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` entries are documented in both `apps/api/.env.example` and the root `.env.example`.
- **New GitHub Actions workflow** (`.github/workflows/release.yml`) — on push to `main` and on `v*` tags: build `brewform-api` and `brewform-web` images, push to GHCR with `GITHUB_TOKEN` (`packages: write`), tag images with `latest` + SHA + git tag. Optionally trigger Coolify deploy webhooks (documented, not required for the image-publish step).
- **Makefile additions** — `make images` (build both images locally), `make images-push` (push to GHCR using local docker login), `make prod-up` / `make prod-down` (run the `prod` compose profile locally for a smoke test), `make release` (CI-equivalent local build+push). Existing `make dev` / `make up` / `make check` / `make test` remain unchanged.
- **`coolify_deployment_plan.md`** — a comprehensive, step-by-step guide covering server setup, Postgres datasource, Docker Image resource creation for API and web, env-var wiring, persistent storage, domain/TLS/CORS, and the deploy-webhook CI integration.

## Capabilities

### New Capabilities

- `container-deployment`: Two registry-publishable Docker images (API + web SPA) with a multi-stage build, an idempotent migrate-on-start entrypoint, and a `compose.yml` `prod` profile that references the published images. Includes the Makefile targets to build, push, and run the prod profile locally.
- `remote-cache`: The API connects to a remote `denokv` server (sidecar container) for its Deno KV cache when `CACHE_DRIVER=deno-kv`, configurable via `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN`. Local dev and prod share the same topology via the `denokv` service in `compose.yml`.
- `ci-image-publishing`: A GitHub Actions release workflow that builds and pushes `brewform-api` and `brewform-web` to GHCR on every `main` push and on version tags, with multi-tag tagging (`latest`, SHA, git tag).

### Modified Capabilities

None. The `static-cache` spec (in-process web cache) is untouched. The API `CacheProvider` abstraction is untouched — only the `Deno.openKv()` call site changes to accept a URL.

## Impact

- **Dockerfile**: API Dockerfile gains a `docker-entrypoint.sh` and `--unstable-kv`; new `Dockerfile.web` for the SPA.
- **compose.yml**: restructured into `dev` and `prod` profiles; adds `denokv` service to both; `prod` profile pulls GHCR images.
- **apps/api/src/main.ts**: one-line change at the `Deno.openKv()` call site (line 127) to honor `DENO_KV_URL`.
- **apps/api/scripts/flush-cache.ts**: same one-line change for consistency.
- **.env.example split**: root `.env.example` (slimmed to local-dev infra), `apps/api/.env.example` (API runtime env for Coolify), `apps/web/.env.example` (web build-time vars for GitHub Secrets). New `DENO_KV_URL` and `DENO_KV_ACCESS_TOKEN` entries in both root and `apps/api/.env.example`.
- **.github/workflows/release.yml**: new workflow file.
- **Makefile**: new targets (`images`, `images-push`, `prod-up`, `prod-down`, `release`).
- **coolify_deployment_plan.md**: new comprehensive deployment doc.
- **No database schema changes** — migrations continue to run via `drizzle-kit migrate` in the entrypoint.
- **No breaking changes to dev workflow** — `make dev` and `make up` behave exactly as before; `CACHE_DRIVER=memory` is still the default for the `dev` profile.

## Non-Goals

- Auto-scaling or multi-replica API deployment (Coolify single-instance is the target; the architecture is ready for scaling but the plan doesn't require it).
- Redis as a cache backend (denokv is the chosen path; Redis would force a `CacheProvider` rewrite for no benefit over a Deno-native KV).
- Coolify-managed Postgres automation in CI (the plan documents the manual panel steps; no Coolify API automation in the workflow).
- Migrating off Deno Deploy for existing users (the Deno Deploy `deploy` config in `deno.json` remains valid and untouched).
- Frontend build-time configuration beyond `VITE_API_URL` / `VITE_PUBLIC_APP_URL` (no new feature flags).