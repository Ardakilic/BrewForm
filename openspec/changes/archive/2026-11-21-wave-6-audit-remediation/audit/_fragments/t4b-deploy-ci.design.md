### Production compose, env config and CI image pipeline (t4b)

**Context**

All claims in this area were validated against the code (details and evidence in
`audit/t4b-deploy-ci.md`):

- **Boot failure.** `compose.production.yml:107,112` inject empty `S3_ENDPOINT`/`S3_PUBLIC_URL`;
  `apps/api/src/config/env.ts:64,69` (`z.url().optional()`) rejects `''`, and `env.ts:115-121`
  throws. Reproduced with zod 4.4.3. Blank `APP_PORT`/`UPLOAD_MAX_SIZE_BYTES` silently coerce to
  `0`.
- **Photo loss.** `docker-entrypoint.sh:32` runs the API with cwd `/app/apps/api`, so
  `UPLOAD_DIR=./uploads` (`compose.production.yml:113`) resolves to `/app/apps/api/uploads`
  (`utils/storage/local.ts:14,32`, `main.ts:91`), outside the `/app/uploads` volume (`:117`).
- **No routing.** The web image only serves files (`apps/web/Caddyfile:1-14`); the SPA targets
  `https://${API_DOMAIN}/api/v1` (`:127`), which nothing routes; the api publishes no port.
  Coolify is unaffected (it routes the API domain itself).
- **Ungated release.** `release.yml` runs in parallel with CI and pushes `:latest` first
  (#168: 1m29s vs 3m40s). No workflow builds the images on PRs. `ci.yml` and `pr.yml` both run on
  every PR.
- **Operations gaps.** No backups, no api/web health checks, no log rotation, no limits. A second,
  broken prod definition exists (`compose.yml:214-246`, `Makefile:238-247`).
- **Image hardening.** The image runs as root with no `HEALTHCHECK` and the whole builder tree, and
  pnpm is PID 1 (`Dockerfile:48-57`). `.dockerignore` is root-anchored. The build runs
  `drizzle-kit generate` (`Dockerfile:35`).
- **Spec drift.** `openspec/specs/container-deployment` and `ci-image-publishing` still describe
  Deno images and the removed Coolify webhook job.

**Decisions**

1. **Blank env values mean "unset", at the schema boundary.**
   - Choice: wrap the existing object schema in `z.preprocess`, which copies the input and drops
     every key whose value is a string that trims to `''`. `envSchema` stays exported (now a
     `ZodPipe`); `Env` becomes `z.output<typeof envSchema>`. `UPLOAD_DIR` gets
     `.transform((p) => path.resolve(p))`. Ports become
     `z.coerce.number().int().min(1).max(65535)` and `UPLOAD_MAX_SIZE_BYTES`
     `z.coerce.number().int().positive()`. `loadEnv` keeps printing `flatten().fieldErrors`
     (messages only, no values) and a test locks that down.
   - Alternatives: per-field `z.union([z.literal(''), z.url()])` (misses ports and enums, easy to
     forget for new vars); dropping `:-` defaults from compose only (Coolify and `.env` users still
     hit it).
   - Rationale: one rule covers every current and future variable, and required variables still
     fail.

2. **Absolute upload directory, verified at startup.**
   - Choice: the image sets `ENV UPLOAD_DIR=/app/uploads` and creates the directory owned by
     `node`; compose sets the same path and mounts the volume there. A new
     `apps/api/src/utils/storage/startup.ts` exports
     `verifyStorage(config, { mkdir, access, stat }, log)`. For local storage it runs `mkdir -p`,
     checks `access(W_OK)`, and compares `stat(dir).dev` with `stat(parent).dev` to warn when a
     production `UPLOAD_DIR` is not a mount point. It logs `{ storageDriver, uploadDir }` (or
     `{ storageDriver: 's3', bucket }`) and throws a typed error that `startup()` in `main.ts` turns
     into `logger.error` plus `process.exit(1)` before `serve()`. `local.ts` and the `/uploads/*`
     handler use `config.UPLOAD_DIR` directly (already absolute) and keep their traversal guards.
   - Alternatives: mount the volume at `/app/apps/api/uploads` (couples the volume to cwd);
     entrypoint `chown` as root followed by privilege drop (keeps a root entrypoint).
   - Rationale: one absolute path, failure is loud, and the API stays fully non-root.

3. **The web Caddy is the edge, opt-in through `API_UPSTREAM`.**
   - Choice: `apps/web/Caddyfile` becomes:
     ```caddyfile
     {
       admin off
       import /etc/caddy/global.d/*.caddy   # entrypoint writes `servers { trusted_proxies ... }` when TRUSTED_PROXIES is set
     }
     :80 {
       encode zstd gzip
       handle /healthz { respond "ok" 200 }
       import /etc/caddy/conf.d/*.caddy     # entrypoint writes the API proxy handle when API_UPSTREAM is valid
       handle {
         root * /usr/share/caddy
         @runtime-config path /config.js
         header @runtime-config Cache-Control "no-store"
         try_files {path} /index.html
         file_server
       }
     }
     ```
     When `API_UPSTREAM` matches `^[A-Za-z0-9._-]+(:[0-9]{1,5})?$`, `docker-web-entrypoint.sh` writes
     `/etc/caddy/conf.d/api-proxy.caddy`:
     ```caddyfile
     @api path /api/* /uploads/* /share/*
     handle @api {
       request_body { max_size {$EDGE_MAX_BODY_SIZE:16MB} }
       reverse_proxy {$API_UPSTREAM} {
         header_up X-Forwarded-For {client_ip}
         header_up X-Real-IP {client_ip}
       }
     }
     ```
     When `TRUSTED_PROXIES` matches `^[A-Za-z0-9_.:/ ]+$` it writes
     `servers { trusted_proxies static <value>  trusted_proxies_strict }` to `global.d/`. An empty
     glob import is not an error in Caddy, so unset values leave the original static-only
     behaviour. Compose sets `API_UPSTREAM=api:8000`, `VITE_API_URL=/api/v1`,
     `TRUSTED_PROXIES=private_ranges`.
   - Alternatives: a separate edge service, Coolify-managed path routing, or publishing the API port
     (compared in `audit/t4b-deploy-ci.md` §4.1); always-on proxying to a default `api:8000` (would
     502 `/share` and `/uploads` in Coolify's split setup).
   - Rationale: one origin removes CORS and fixes `/uploads` and `/share` URLs. Opt-in keeps the
     running Coolify deployment byte-for-byte compatible.
   - Client-IP contract with t2: `{client_ip}` is Caddy's right-to-left resolution over trusted
     proxies, and overriding `X-Forwarded-For` with it gives the API exactly one hop, so t2's
     `TRUST_PROXY=hops` / `TRUST_PROXY_HOPS=1` is correct both with and without an outer proxy. The
     CI smoke test asserts the header shape (the `header_up` override of the default
     `X-Forwarded-For` must be verified on Caddy 2.11.9; fallback: `header_up -X-Forwarded-For`
     followed by `header_up X-Forwarded-For {client_ip}`).

4. **Runtime public URL for the web image.**
   - Choice: `Dockerfile.web` runner re-declares `ARG VITE_PUBLIC_APP_URL` and sets
     `ENV BREWFORM_BUILD_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL`. The entrypoint validates
     `PUBLIC_APP_URL` against `^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$`, strips a
     trailing slash, and runs `sed` with a `|` delimiter (the allowlist excludes `|`, `&` and `\`) to
     replace the build value in `index.html` and `robots.txt`. The originals are copied once to
     `*.orig` so restarts with a different value stay correct.
   - Alternatives: render meta tags from `/config.js` (crawlers do not run JS); rebuild per deploy.
   - Rationale: the published image works for every self-hoster without a rebuild.

5. **One-shot migrate service; the entrypoint gains modes.**
   - Choice: `docker-entrypoint.sh` takes `serve` (default) or `migrate`. Both run
     `node packages/db/src/migrate.ts` (a new Drizzle `migrate()` runner using
     `drizzle-orm/postgres-js/migrator`, `migrationsFolder` resolved from `import.meta.url`, the
     default `drizzle.__drizzle_migrations` table, entry/exit logs, client closed in `finally`) and
     then the first-boot check and seed via `node`. `serve` skips both when `RUN_MIGRATIONS=false`.
     `compose.production.yml` adds `migrate` (same image, `command: ["migrate"]`, `restart: "no"`)
     and makes `api` depend on it with `condition: service_completed_successfully`, with
     `RUN_MIGRATIONS=false` on api. The db `migrate` script switches to the same runner
     (`node src/migrate.ts`), so dev, CI and production share one code path; `generate`/`push` stay
     on drizzle-kit.
   - Alternatives: an advisory lock around migrations (raw SQL, against the Drizzle-only rule);
     keeping drizzle-kit at runtime (devDependency, about 30 MB).
   - Rationale: Compose provides the ordering, the failure is visible, and Coolify (Docker Image
     resource, default `serve`) behaves exactly as today. The single-replica assumption and
     expand/contract are documented.

6. **Slim, non-root API runtime with direct `node`.**
   - Choice: add a `prod-deps` stage
     (`FROM builder` → `pnpm install --prod --frozen-lockfile --offline` → remove `apps/web`,
     `openspec`, `plans`, `docs`, coverage and tests). The runner copies `package.json`,
     `pnpm-workspace.yaml`, `node_modules`, `apps/api`, `packages/db`, `packages/shared` and `files`
     from it; installs `tini` (`apt-get install --no-install-recommends tini`); creates
     `/app/uploads` owned by `node`; sets `USER node`;
     `ENTRYPOINT ["/usr/bin/tini","-g","--","/app/docker-entrypoint.sh"]`; and declares
     `HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --start-interval=2s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:'+(process.env.APP_PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]`.
     The entrypoint ends with `cd /app/apps/api && exec node src/main.ts` (Node 26 type stripping;
     workspace packages stay symlinked to `/app/packages/*`, outside `node_modules`). Remove
     `RUN pnpm --filter @brewform/db run generate`. Keep `pnpm run check` in `builder`.
   - Fallback if a spike shows a module that native stripping cannot load: move `tsx` to
     `dependencies` of `@brewform/api` and `@brewform/db` and run `node --import tsx src/main.ts`
     (still a single node process).
   - Alternatives: `pnpm deploy --prod` (copies workspace packages into `node_modules`, so native
     stripping is impossible); `docker run --init` / compose `init: true` only (Coolify Docker Image
     resources do not set it).
   - Rationale: removes root, the pnpm/tsx wrappers, and apps/web plus dev tooling from the attack
     surface. `tini -g` forwards `SIGTERM` to the whole process group, so a stop during migrations is
     honoured.
   - Health check endpoint: the image probes `/health` because Coolify's Traefik drops unhealthy
     containers from routing, and a DB blip should return `503`, not `404`. The compose api service
     overrides it with `/ready` for startup ordering.

7. **Production compose shape.**
   - Choice: top-level `name: brewform-prod`; an `x-logging` anchor (`json-file`,
     `${DOCKER_LOG_MAX_SIZE:-10m}`, `${DOCKER_LOG_MAX_FILE:-5}`) on every service; an `x-api-env`
     anchor shared by `migrate` and `api`. Images are `${API_IMAGE:-ghcr.io/ardakilic/brewform-api}:${IMAGE_TAG:-latest}`
     (and the web equivalent). Required vars: `POSTGRES_PASSWORD`, `VALKEY_PASSWORD`, `JWT_SECRET`,
     `ADMIN_PASSWORD`, `WEB_DOMAIN`; `API_DOMAIN` is dropped. `S3_*` lines are passed without
     `:-` defaults (blank is harmless after decision 1 either way). `UPLOAD_DIR: /app/uploads`.
     `deploy.resources.limits.memory` on each service. api: `stop_grace_period: 30s` and a
     healthcheck running `node -e` against `/ready` (interval 15s, start_period 60s, retries 5).
     web: `depends_on: api: service_healthy` and a healthcheck running
     `wget -qO /dev/null http://127.0.0.1/healthz`.
   - Valkey keeps the password out of argv:
     ```yaml
     command: ["sh", "-c", "printf 'requirepass %s\\nmaxmemory %s\\n' \"$$VALKEY_PASSWORD\" \"$$VALKEY_MAXMEMORY\" > /tmp/valkey.conf && exec docker-entrypoint.sh valkey-server /tmp/valkey.conf --appendonly yes"]
     ```
     (the official entrypoint still drops to the `valkey` user); healthcheck
     `["CMD-SHELL", "VALKEYCLI_AUTH=\"$$VALKEY_PASSWORD\" valkey-cli ping | grep -q PONG"]`. Policy
     stays `noeviction` (t2).
   - Backup service: inline `sh -c` loop on `postgres:18-trixie` with `PGHOST/PGUSER/PGPASSWORD/PGDATABASE`.
     Each run writes `pg_dump -Fc -f /backups/.db-$ts.partial`, renames it to `db-$ts.dump`, then (if
     `BACKUP_UPLOADS` is true) does the same with `tar -czf` of the read-only `/uploads` mount, runs
     `find -mtime +$BACKUP_RETENTION_DAYS -delete`, and sleeps for the interval. `BACKUP_ONESHOT=1`
     exits after one pass (used by `make prod-backup` through `docker compose run --rm`). Healthcheck:
     `find /backups -name 'db-*.dump' -mmin -<2×interval in minutes>` returns a file.
   - Alternatives: a third-party backup image; runbook only (§4.4 of the audit notes).
   - Rationale: everything works from the compose file and `.env.production` alone, with no repo
     checkout needed on the server.

8. **One CI workflow, gated publish, PR image smoke test.**
   - Choice: rename `ci.yml` to `name: CI`; triggers `pull_request` (main), `push` (main, tags `v*`).
     Top-level `permissions: contents: read` and
     `concurrency: { group: ci-${{ github.event.pull_request.number || github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`.
     Jobs:
     - `quality`: unchanged steps.
     - `test` (`needs: quality`): unchanged, keeps the coverage comment; the only job with
       `pull-requests: write` and `actions: read`; `dawidd6/action-download-artifact` SHA-pinned.
     - `images` (`needs: quality`, in parallel with `test`, `timeout-minutes: 30`): buildx; two
       `docker/build-push-action` steps with `load: true`, tags `brewform-api:ci` /
       `brewform-web:ci`, `cache-from: type=gha,scope=<img>`,
       `cache-to: type=gha,scope=<img>,mode=max,ignore-error=true`; then a smoke script
       (`scripts/ci/smoke-images.sh`, kept in the repo so it can be run locally) that creates a
       network, starts `postgres:18-trixie`, starts the API (`APP_ENV=production`, test secrets),
       polls `/ready` for up to 120 s, asserts `id -u` ≠ 0 and health `healthy`, starts the web image
       with `API_UPSTREAM=api:8000`, and curls `/healthz`, `/` (expects `<div id="root">`),
       `/api/v1/sitemap.xml` (expects XML). The client-IP contract is checked against a header
       echo upstream (a one-line `node -e` HTTP server on the same `node:26.13.0-trixie-slim` image,
       so no third-party image is needed) behind a second web container: with `TRUSTED_PROXIES`
       unset, a spoofed `X-Forwarded-For` arrives as the single runner-side peer address; with
       `TRUSTED_PROXIES=private_ranges`, `X-Forwarded-For: 1.2.3.4, 203.0.113.9` arrives as
       `203.0.113.9`. On failure it dumps `docker logs`; it always cleans up.
     - `publish` (`needs: [quality, test, images]`, `if: github.event_name == 'push'`,
       `permissions: contents: read, packages: write`): login, then per image `docker/metadata-action`
       (`images: ghcr.io/${{ github.repository_owner }}/brewform-<img>`; tags
       `type=raw,value=latest,enable={{is_default_branch}}`, `type=sha,format=long,prefix=`,
       `type=ref,event=tag`) and `build-push-action` with `push: true`, the same build args and
       `cache-from` scope, so it is a cache hit.
     Delete `pr.yml` and `release.yml`. Pin `pnpm/action-setup` and `dawidd6/...` by SHA with a
     version comment (Renovate's `helpers:pinGitHubActionDigests` keeps them current).
   - Alternatives: `workflow_run`-triggered `release.yml` (§4.2 of the audit notes); building inside
     `publish` only (no PR coverage); splitting tests into parallel jobs (would need coverage
     artifacts for the comment; not needed for this change).
   - Rationale: one status per commit; nothing reaches `:latest` without tests; Dockerfile and
     entrypoint regressions surface on the PR.

9. **Makefile: local images only, `prod-*` wrap the real file.**
   - Choice: `images` tags `brewform-api:local` / `brewform-web:local`. Add
     `PROD_COMPOSE = docker compose --env-file .env.production -f compose.production.yml` and a
     `prod-env-check` prerequisite (`test -f .env.production || { echo ...; exit 1; }`). Add
     `prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`, `prod-backup` and `prod-smoke`
     (`API_IMAGE=brewform-api WEB_IMAGE=brewform-web IMAGE_TAG=local $(PROD_COMPOSE) up -d`).
     Remove `images-push`, `release` and `prod-up-build`; remove `app-prod`/`web-prod` from
     `compose.yml`.

**Risks / Trade-offs**

- [Native type stripping fails on some module at runtime] → A spike task runs the full graph in
  the built image first; the fallback (`node --import tsx`, tsx in dependencies) keeps a single node
  process; the PR smoke test catches regressions.
- [Existing compose installs lose photos on upgrade, because they currently live in the container
  layer] → Upgrade notes (production-operations) give the `docker compose cp` rescue commands to
  run before pulling; release notes repeat them. brewform.cc uses S3 and is unaffected.
- [Existing `uploads` volume is root-owned, so the non-root API fails fast] → Fail-fast error names
  the directory and the documented `chown 1000:1000` fix; new volumes inherit `node` ownership
  from the image.
- [Project name change hides existing volumes (`<dir>_postgres_data` becomes
  `brewform-prod_postgres_data`)] → Upgrade notes: set `COMPOSE_PROJECT_NAME` to the old name in
  `.env.production`. The file is one week old (#166), so few installs exist.
- [`TRUSTED_PROXIES=private_ranges` lets a client spoof its IP when port 80 is exposed directly
  through rootless Docker or userland-proxy NAT, where the peer looks private] → Documented: set
  `TRUSTED_PROXIES=` (trust none) when nothing sits in front; normal iptables DNAT preserves public
  source IPs.
- [Coolify dashboard health check needs curl/wget, which the image does not ship] → The Coolify
  guide says to disable the dashboard check for the API so Coolify uses the image `HEALTHCHECK`.
  The web image has busybox `wget`. Verify the brewform.cc setting before rollout.
- [Health checks consume rate-limit budget] → t2 exempts `/health` and `/ready`; intervals are
  15–30 s.
- [Backups on the same disk] → Docs require off-host copies and recommend `STORAGE_DRIVER=s3`;
  the backup health check surfaces staleness.
- [Full uploads tarball every day grows large] → Retention applies; `BACKUP_UPLOADS=false` with S3;
  incremental tooling (restic) documented as an option.
- [Merged CI makes PR wall time longer (image build of about 5 min in parallel with tests)] →
  Runs in parallel with `test`; gha cache; superseded PR runs are cancelled.
- [GHCR cache writes from fork PRs fail] → `ignore-error=true` on `cache-to`.
- [Pending `main` runs can be superseded when three pushes land quickly] → The newest commit still
  publishes; `latest` ends correct.
- [Valkey `maxmemory` with `noeviction` makes writes fail when full] → The cache layer degrades to
  misses (cache-driver track); the limiter's failure mode is owned by t2.
- [Concurrent edits to the same files by t2 (compose api env), t4a (env lines), the security
  headers work (Caddyfile) and t8 (docs, `doc-drift` CI job)] → Merge-order notes in tasks; this
  track lands env preprocessing early, the compose rewrite carries t2's env lines, and the Caddyfile
  layout leaves the static `handle` for header rules.

**Migration / Rollout**

- **DB:** no schema change. `make db-generate` must still print "No schema changes, nothing to
  migrate". The db `migrate` script switches runner, and the existing `drizzle.__drizzle_migrations`
  rows are reused (same table and schema defaults).
- **Env vars (new, all optional):**
  - API: `RUN_MIGRATIONS` (`true`).
  - Web image: `API_UPSTREAM`, `PUBLIC_APP_URL`, `TRUSTED_PROXIES`, `EDGE_MAX_BODY_SIZE` (`16MB`).
  - Compose: `IMAGE_TAG`, `API_IMAGE`, `WEB_IMAGE`, `DOCKER_LOG_MAX_SIZE`, `DOCKER_LOG_MAX_FILE`,
    `*_MEMORY_LIMIT`, `VALKEY_MAXMEMORY`, `BACKUP_DIR`, `BACKUP_INTERVAL_SECONDS`,
    `BACKUP_RETENTION_DAYS`, `BACKUP_UPLOADS`, `COMPOSE_PROJECT_NAME` (override).
  - `API_DOMAIN` is no longer required.
- **Behaviour changes:** blank env values now mean "unset"; bad ports or sizes fail fast; an
  unwritable local upload directory fails fast.
- **CI:** delete `pr.yml` and `release.yml` in the same PR that adds `images`/`publish` to
  `ci.yml`. After merge, the first `main` run publishes via `publish`. Optionally enable branch
  protection requiring `quality`, `test` and `images`. Remove stale `COOLIFY_*` secrets.
- **Coolify (brewform.cc):** no env change is required (web without `API_UPSTREAM` stays
  static-only; the API keeps migrate-on-boot). Disable the dashboard Healthcheck on the API resource
  (the image now provides one) or leave it as is if it is already off. Optional: set `PUBLIC_APP_URL`
  on the web resource.
- **Compose installs:** follow the upgrade notes (rescue `/app/apps/api/uploads`, `chown` the
  volume, set `COMPOSE_PROJECT_NAME` if needed), then `make prod-pull && make prod-up`.
- **Rollback:** set `IMAGE_TAG` to the previous `<sha>` (compose) or switch the tag in Coolify.
  Workflow changes revert by restoring `release.yml`/`pr.yml` from git. No data migration needs
  undoing.
