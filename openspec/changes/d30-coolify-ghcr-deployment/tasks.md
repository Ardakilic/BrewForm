## 1. API Dockerfile — Entrypoint + email templates + `--unstable-kv`

- [ ] 1.1 Create `docker-entrypoint.sh` at repo root with: `#!/bin/sh`, `set -e`, echo "Running database migrations...", `cd /app/packages/db && deno run -A npm:drizzle-kit@0.31.10 migrate`, echo "Migrations complete.", first-boot seed check via `deno eval` (query `SELECT count(*) FROM users` using `@brewform/db`), conditional seed run / skip with log, echo "Starting BrewForm API...", `exec deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --unstable-cron --unstable-kv /app/apps/api/src/main.ts`. See `design.md` §3 for the full reference script.
- [ ] 1.2 If `deno eval` has issues resolving `@brewform/db` in the entrypoint context, create `scripts/check-users-empty.ts` as a fallback: imports `db` from `@brewform/db`, runs `SELECT count(*) FROM users`, prints the count to stdout, closes the DB client. The entrypoint calls `deno run -A /app/scripts/check-users-empty.ts` and captures stdout.
- [ ] 1.3 Update the `Dockerfile` `builder` stage to run `deno task email-build` (compiles MJML → TypeScript) BEFORE the runner copies the app. Currently the builder only runs `cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate` and `deno check apps/api/src/main.ts` — email templates are missing from the image. Add `RUN deno task email-build` after the generate step.
- [ ] 1.4 Update the `Dockerfile` `runner` stage: remove the `CMD` line, add `COPY docker-entrypoint.sh /app/docker-entrypoint.sh`, `RUN chmod +x /app/docker-entrypoint.sh`, set `ENTRYPOINT ["/app/docker-entrypoint.sh"]`. Keep `EXPOSE 8000`. The `deps` and `builder` stages stay otherwise unchanged.
- [ ] 1.5 Verify the runner image contains: `apps/api/src/main.ts` + all imported modules, `packages/db/drizzle/` (migration SQL files), `packages/db/drizzle.config.ts`, compiled email templates, `node_modules/` (with `drizzle-kit`), `docker-entrypoint.sh` (executable). Run: `docker run --rm ghcr.io/ardakilic/brewform-api:latest ls /app/packages/db/drizzle/ /app/docker-entrypoint.sh`
- [ ] 1.6 Test the entrypoint locally: `docker run --rm -e DATABASE_URL=... -e JWT_SECRET=test-secret-min16chars -e CACHE_DRIVER=memory -p 8000:8000 ghcr.io/ardakilic/brewform-api:latest` and verify stdout shows the migration/seed/start sequence and `GET /health` returns 200.

## 2. Web Dockerfile — New `Dockerfile.web`

- [ ] 2.1 Create `Dockerfile.web` with three stages: `deps` (same as API Dockerfile deps — `denoland/deno:debian-2.7.14`, copy workspace manifests, `deno install --frozen`), `builder` (`denoland/deno:debian-2.7.14`, copy source, `ARG VITE_API_URL=/api/v1`, `ARG VITE_PUBLIC_APP_URL=http://localhost:8080`, `ENV VITE_API_URL=$VITE_API_URL`, `ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL`, `RUN deno task --cwd apps/web build`), `runner` (`caddy:2-alpine`, `COPY --from=builder /app/apps/web/dist /usr/share/caddy`, write `:80` Caddyfile to `/etc/caddy/Caddyfile`, `EXPOSE 80`). See `design.md` §2 for the full reference Dockerfile.
- [ ] 2.2 Write the production `Caddyfile` content in the runner stage via `RUN printf ':80\nroot * /usr/share/caddy\nfile_server\ntry_files {path} /index.html\n' > /etc/caddy/Caddyfile` (inline, no separate file needed). Do NOT copy the repo-root `Caddyfile` (it listens on `:8080` for the preview profile — wrong port for the prod image).
- [ ] 2.3 Do NOT set a `CMD` — the `caddy:2-alpine` base image's default CMD is `caddy run --config /etc/caddy/Caddyfile --adapter caddyfile`, which reads the file we wrote.
- [ ] 2.4 Test the web image locally: `docker build -f Dockerfile.web -t brewform-web-test .` then `docker run --rm -p 8080:80 brewform-web-test` and verify `GET /` returns `index.html`, `GET /favicon.svg` returns the SVG, `GET /some/spa/route` returns `index.html` (SPA fallback).
- [ ] 2.5 Test with production build-args: `docker build -f Dockerfile.web --build-arg VITE_API_URL=https://api.example.com/api/v1 --build-arg VITE_PUBLIC_APP_URL=https://example.com -t brewform-web-prod .` and verify `docker run --rm brewform-web-prod cat /usr/share/caddy/index.html | grep og:image` contains `https://example.com/og-default.png`.

## 3. Compose — `prod` profile + `denokv` sidecar

- [ ] 3.1 Add a `denokv` service to `compose.yml` (no profile constraint, or listed in both): `image: ghcr.io/denoland/denokv:0.14.0`, `command: ["--sqlite-path", "/data/denokv.sqlite", "serve", "--access-token", "${DENO_KV_ACCESS_TOKEN}"]`, `volumes: ["denokv_data:/data"]`. Add `denokv_data` to the top-level `volumes:` block. Do NOT add a compose healthcheck (the denokv image is distroless, has no shell for `CMD-SHELL` healthcheck) — use `service_started` in `depends_on` instead of `service_healthy`. See `design.md` §8 and `remote-cache` spec for the reference service definition.
- [ ] 3.2 Add `denokv` to the `dev`-profile `app` and `app-preview` services' `depends_on` with `condition: service_started`. Add `DENO_KV_URL=http://denokv:4512` and `DENO_KV_ACCESS_TOKEN=${DENO_KV_ACCESS_TOKEN}` to their `environment` blocks.
- [ ] 3.3 Add a `prod` profile with `app-prod` service: `image: ghcr.io/ardakilic/brewform-api:latest`, `build: { context: ., dockerfile: Dockerfile }` (for `--build`), `ports: ["8000:8000"]`, `env_file: [.env]`, `depends_on: [postgres (healthy), denokv (started)]`, `profiles: [prod]`.
- [ ] 3.4 Add a `prod`-profile `web-prod` service: `image: ghcr.io/ardakilic/brewform-web:latest`, `build: { context: ., dockerfile: Dockerfile.web }` (for `--build`), `ports: ["8080:80"]`, `depends_on: [app-prod (started)]`, `profiles: [prod]`. Note: host 8080 → container 80 (the Caddyfile in the image listens on `:80`).
- [ ] 3.5 In `.env.example`, set `CACHE_DRIVER=memory` (dev default, unchanged) and document that the `prod` profile / Coolify sets `CACHE_DRIVER=deno-kv`. The `app-prod` service reads from `.env` via `env_file`, so the operator must set `CACHE_DRIVER=deno-kv` in `.env` for local prod-smoke-testing (or create a `.env.prod` — but `env_file: [.env]` is simpler).
- [ ] 3.6 Verify `docker compose --profile prod up --build` builds and starts `app-prod`, `web-prod`, `denokv`, `postgres`. Verify `GET http://localhost:8000/health` returns 200 and `GET http://localhost:8080/` returns `index.html`.
- [ ] 3.7 Verify `make up` (no profile) still starts only `postgres`, `mailpit`, `pgadmin`, `garage`, `denokv` (infra) and does NOT start `app-prod` or `web-prod`. Verify `make dev` still starts only `app` and `web-dev` (dev profile).

## 4. API Source — Remote KV URL + env schema

- [ ] 4.1 Update `apps/api/src/main.ts:126-131`: change `kv = await Deno.openKv()` to `const kvUrl = Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512'; logger.info({ url: kvUrl }, 'Deno KV cache connecting to remote server'); kv = await Deno.openKv(kvUrl);` and change the info log from `'Deno KV cache initialized'` to `'Deno KV cache initialized (remote)'`. See `remote-cache` spec for the exact before/after.
- [ ] 4.2 Update `apps/api/scripts/flush-cache.ts:10`: change `const kv = await Deno.openKv();` to `const kv = await Deno.openKv(Deno.env.get('DENO_KV_URL') ?? 'http://denokv:4512');`
- [ ] 4.3 Update the `make flush-cache` Makefile target to add `--allow-net` (currently passes `--allow-env --allow-read --allow-write` — remote KV needs `--allow-net` for the HTTP connection).
- [ ] 4.4 Add `DENO_KV_URL: z.string().optional()` and `DENO_KV_ACCESS_TOKEN: z.string().optional()` to the Zod env schema in `apps/api/src/config/env.ts`, immediately after the `CACHE_DRIVER` field (line 18). See `remote-cache` spec for the exact placement.
- [ ] 4.5 Verify `CACHE_DRIVER=memory` path is untouched: run `make check` and `make test` — the existing tests use `CACHE_DRIVER=memory` and should pass without changes.
- [ ] 4.6 Verify `CACHE_DRIVER=deno-kv` with a running denokv: start `denokv` locally (`docker run -p 4512:4512 -v denokv_data:/data ghcr.io/denoland/denokv:0.14.0 --sqlite-path /data/denokv.sqlite serve --access-token test-token`), set `CACHE_DRIVER=deno-kv DENO_KV_URL=http://localhost:4512 DENO_KV_ACCESS_TOKEN=test-token`, and start the API — verify the log shows "Deno KV cache initialized (remote)" and cache operations work.

## 5. Split `.env.example` into three files

- [ ] 5.1 Create `apps/api/.env.example` — the complete API runtime env reference (paste into Coolify API resource). Include all API env vars: APP_PORT, APP_ENV, LOG_LEVEL, LOG_FORMAT, PUBLIC_APP_URL, DATABASE_URL, DATABASE_PROVIDER, CACHE_DRIVER=deno-kv (prod default), DENO_KV_URL=http://denokv:4512, DENO_KV_ACCESS_TOKEN=, JWT_SECRET, JWT_*_EXPIRY, ADMIN_*, CORS_ALLOWED_ORIGINS, SMTP_*, OPENAPI_ENABLED, ENABLE_REGISTRATION, STORAGE_DRIVER=s3, S3_*. See `remote-cache` spec for the exact denokv entries and comments.
- [ ] 5.2 Create `apps/web/.env.example` — web build-time vars only (NOT runtime). Document `VITE_API_URL=https://api.brewform.example.com/api/v1`, `VITE_PUBLIC_APP_URL=https://brewform.example.com`, `VITE_LOG_LEVEL=info` with comments explaining these are set as GitHub Secrets (or `--build-arg` for local builds), not runtime env. The web container has no runtime env.
- [ ] 5.3 Slim down the root `.env.example` to local-dev infra only: `CACHE_DRIVER=memory` (dev default), `DENO_KV_URL=http://denokv:4512`, `DENO_KV_ACCESS_TOKEN=`, Postgres creds, Garage S3 keys, pgAdmin creds. Add a header pointing to `apps/api/.env.example` and `apps/web/.env.example` for the full env surfaces. Remove all API runtime vars (APP_*, DATABASE_URL, JWT_*, SMTP_*, S3_*, ADMIN_*, CORS_*, OPENAPI_ENABLED, ENABLE_REGISTRATION) and all web vars (VITE_*) from the root file — they now live in the split files.

## 6. GitHub Actions — `release.yml`

- [ ] 6.1 Create `.github/workflows/release.yml` with the workflow from `design.md` §7 / `ci-image-publishing` spec. Triggers: `push: branches: [main]` and `push: tags: ['v*']`. Permissions: `contents: read, packages: write`. Three jobs: `api` (builds Dockerfile, pushes to ghcr.io/ardakilic/brewform-api), `web` (builds Dockerfile.web with build-args from secrets, pushes to ghcr.io/ardakilic/brewform-web), `deploy` (optional, curls Coolify webhooks).
- [ ] 6.2 Use `docker/build-push-action@v6` with `cache-from: type=gha` and `cache-to: type=gha,mode=max` for both jobs.
- [ ] 6.3 For the `web` job, use `build-args: | VITE_API_URL=${{ secrets.VITE_API_URL || '/api/v1' }} VITE_PUBLIC_APP_URL=${{ secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}` (fallback to dev defaults if secrets are unset).
- [ ] 6.4 For the `deploy` job, use `if: ${{ secrets.COOLIFY_API_WEBHOOK != '' }}` and `needs: [api, web]`, with `curl ... || true` for both webhooks.
- [ ] 6.5 Do NOT modify `ci.yml` — it stays as the quality + tests workflow, independent of `release.yml`.

## 7. Makefile — New targets

- [ ] 7.1 Add `images` target: `docker build -t ghcr.io/ardakilic/brewform-api:latest -f Dockerfile .` and `docker build -t ghcr.io/ardakilic/brewform-web:latest -f Dockerfile.web --build-arg VITE_API_URL=$${VITE_API_URL:-/api/v1} --build-arg VITE_PUBLIC_APP_URL=$${VITE_PUBLIC_APP_URL:-http://localhost:8080} .` (shell parameter expansion for env-var override). See `container-deployment` spec for the exact Makefile syntax.
- [ ] 7.2 Add `images-push` target: `docker push ghcr.io/ardakilic/brewform-api:latest` and `docker push ghcr.io/ardakilic/brewform-web:latest`.
- [ ] 7.3 Add `prod-up` target: `docker compose --profile prod up -d`.
- [ ] 7.4 Add `prod-up-build` target: `docker compose --profile prod up -d --build`.
- [ ] 7.5 Add `prod-down` target: `docker compose --profile prod down`.
- [ ] 7.6 Add `release` target: `make images && make images-push`.
- [ ] 7.7 Update `.PHONY` to include: `images images-push prod-up prod-up-build prod-down release`. Keep all existing targets untouched.

## 8. `coolify_deployment_plan.md` — Comprehensive operator guide

- [ ] 8.1 `coolify_deployment_plan.md` already exists at repo root. Review it against the final implemented shapes (health endpoint is `/health` not `/api/v1/health`; web container port is 80 not 8080; denokv command is `--sqlite-path /data/denokv.sqlite serve --access-token <token>`). Update any placeholders that reference the old shapes.
- [ ] 8.2 Ensure the "What's been done" table matches the actual implemented files.
- [ ] 8.3 Ensure the troubleshooting section covers: Zod env validation failure, DB connection refused, denokv unreachable, CORS errors, R2 upload 404, migration failure, seed-runs-every-time, denokv-data-lost, GHCR-pull-fails.
- [ ] 8.4 Ensure the post-deploy verification checklist uses the correct health endpoint (`/health`, not `/api/v1/health`) and the correct web port (`80`, mapped to host `8080` in local prod profile).

## 9. Format, Lint, Type-Check, Tests

- [ ] 9.1 Run `make fmt` — auto-format `docker-entrypoint.sh`, `Dockerfile`, `Dockerfile.web`, `compose.yml`, `Makefile`, `apps/api/src/main.ts`, `apps/api/scripts/flush-cache.ts`, `apps/api/src/config/env.ts`, `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`. Note: `deno fmt` may not format `Dockerfile`/`Dockerfile.web`/`docker-entrypoint.sh`/`.env.example` files (not in the fmt include list) — format those manually if needed.
- [ ] 9.2 Run `make lint` — fix any lint errors in the changed `.ts` files (`main.ts`, `flush-cache.ts`, `env.ts`).
- [ ] 9.3 Run `make check` — fix any TypeScript errors. The new `DENO_KV_URL`/`DENO_KV_ACCESS_TOKEN` fields in the env schema are `z.string().optional()` which infers as `string | undefined`, so no downstream type errors are expected.
- [ ] 9.4 Run `make test` — ensure all existing tests pass. Tests use `CACHE_DRIVER=memory`, so the KV URL change is not exercised. No test changes are expected unless the implementer wants to add a test for the `DENO_KV_URL` fallback logic (optional).
- [ ] 9.5 Run `make test-specific filter=routes/openapi.coverage.test.ts` — ensure the OpenAPI coverage test still passes (no new routes added, but verify).
- [ ] 9.6 Verify `docker compose --profile prod up --build` completes locally: API responds on `http://localhost:8000/health` with 200, web responds on `http://localhost:8080/` with `index.html`, denokv is running, postgres is running.

## 10. Logging

- [ ] 10.1 In `main.ts`, the `logger.info({ url: kvUrl }, 'Deno KV cache connecting to remote server')` log is added before the `Deno.openKv()` call (part of task 4.1). Verify it uses the module-scoped `logger` (`createLogger('main')`) and includes the `url` field for traceability.
- [ ] 10.2 In `main.ts`, the `logger.info('Deno KV cache initialized (remote)')` log replaces the old `'Deno KV cache initialized'` (ambiguous about local vs remote). The `'In-memory cache initialized'` log is unchanged.
- [ ] 10.3 In `docker-entrypoint.sh`, the `echo` statements serve as logging: "Running database migrations...", "Migrations complete.", "Database is empty, running seed..." / "Seed skipped — database already contains data (<N> users).", "Seeding complete.", "Starting BrewForm API...". These go to container stdout, which Coolify captures. No structured logging needed for the shell script (it runs before the API's logger is available).