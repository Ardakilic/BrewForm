# Refine fragment: ops-health-storage (D5 local storage, OQ4 health and readiness, U4 CI gating)

Owner of: `specs/production-operations/`, `specs/container-deployment/`, `specs/api-env-config/`,
`specs/ci-image-publishing/`, and the deploy-related parts of `specs/deployment-guide/`.
All five deltas are edited in place. `openspec validate wave-6-audit-remediation --strict` passes.

## 1. Findings

### 1.1 Repository state (HEAD `ada9f6e`)

| # | Finding | Evidence |
|---|---|---|
| F1 | Uploads volume target and API directory disagree today | `compose.production.yml:113` `UPLOAD_DIR: ${UPLOAD_DIR:-./uploads}`, `:116-117` `uploads:/app/uploads`; `docker-entrypoint.sh:32` runs from `/app/apps/api`, so files land in `/app/apps/api/uploads` (t4b C2). |
| F2 | `UPLOAD_DIR` is interpolated, so an operator value can move the directory off the mount | `compose.production.yml:113`. Wave 6 makes it the literal `/app/uploads`. |
| F3 | Postgres and uploads use fixed named volumes, with no host-folder option | `compose.production.yml:50-51,116-117,132-135`. |
| F4 | `/health` and `/ready` exist; `/ready` runs raw `sql\`SELECT 1\`` from a route file that imports `drizzle-orm` (AGENTS.md: no raw SQL; 3-layer modules) and has no timeout | `apps/api/src/routes/health.ts:1-2,30-36`. Mounted at `/` by `apps/api/src/routes/index.ts:43`. |
| F5 | The existing health tests are tautological (they assert object literals) | `apps/api/src/routes/health.test.ts:5-25`. |
| F6 | Shutdown has no readiness flag and no re-entry guard | `apps/api/src/main.ts:144-167` (`shutdown` registered for both `SIGTERM` and `SIGINT`). |
| F7 | `/health` and `/ready` count against the global limit today; t2 exempts them | `apps/api/src/main.ts:75`; `specs/api-rate-limiting/spec.md:140,165-167`; `tasks.md:275`. |
| F8 | t2 adds `cache` and `rateLimitStore` to `/ready`, with the status code tied to the DB only | `specs/cache-driver/spec.md:108-119`; `tasks.md:320,322` (6.34, 6.36). Consistent with this fragment; no cross-folder change needed. |
| F9 | The API image has neither `curl` nor `wget`; the current Dockerfile declares no `HEALTHCHECK` | `Dockerfile:48-57`; t4b C9. |
| F10 | The web image is `caddy:2.11.9-alpine`; `/healthz` does not exist yet | `Dockerfile.web:49-57`, `apps/web/Caddyfile:1-14`. BusyBox `wget` comes with the Alpine base (t4b already relies on it). |
| F11 | The Valkey password is on the server and health-check command lines | `compose.production.yml:61,65` (`--requirepass`, `valkey-cli -a`). |
| F12 | The Coolify guide configures an HTTP check on `/health` for an image without curl/wget, and an HTTP check on `/` for the web | `docs/deployment_coolify.md:147-149,230`. |
| F13 | Local photo URLs are root-relative and the web app uses them verbatim | `apps/api/src/utils/upload/index.ts:74-79` (`/uploads/<file>`); no URL rewriting in `apps/web/src` (`grep -rnE "/uploads|resolveUrl|apiOrigin" apps/web/src` returns nothing). On Coolify's split-domain setup the browser fetches `/uploads/<file>` from the web domain, which answers `index.html`. Local storage on Coolify therefore needs the same-origin edge (`API_UPSTREAM`). |
| F14 | The t8 `deployment-guide` delta became false under t4b | `specs/deployment-guide/spec.md` (before this refine): "the same binary that `docker-entrypoint.sh` and the `Dockerfile` builder stage run" (t4b removes drizzle-kit from both, tasks 19.2, 19.6), and production migrate/seed "through `pnpm --filter @brewform/db run migrate`" (the runtime image has no pnpm, task 19.6). Both requirements were rewritten (deploy-related part). |
| F15 | t4b's publish job rebuilds from the gha cache, so a cache miss could publish an image that was never smoke-tested | `design.md:474-475`; `audit/_fragments/t4b-deploy-ci.design.md:210-215` ("so it is a cache hit"). GitHub evicts gha cache above 10 GB per repository. |
| F16 | `publish.needs` must include `doc-drift` (t8 task 27.6), and that job must run on push events or `publish` is skipped forever | `tasks.md:20` (1.6), task 27.6. |
| F17 | `BACKUP_DIR` (host `./backups`) is the only backup target in the t4b drafts | `specs/production-operations/spec.md` (before), `tasks.md:750` (20.12), `audit/_fragments/t4b-deploy-ci.design.md:281`. |

### 1.2 External facts verified

- **Compose source rule** (compose-go `format/volume.go`, `isFilePath`): after interpolation, a
  short-syntax source that starts with `.`, `/` or `~` (or a Windows drive or `\\`) is a bind
  mount; anything else is a named volume. A named volume must be declared under top-level
  `volumes:`, or `docker compose config` fails with "refers to undefined volume". Docker docs: "For
  bind mounts, the short syntax creates a directory at the source path on the host if it doesn't
  exist" (root-owned); `create_host_path` exists only in the long syntax. Relative paths resolve
  against the first compose file's directory.
- **Named volume ownership**: an empty named volume mounted on an image directory gets that
  directory's content and ownership on first mount, so `/app/uploads` owned by `node` (UID/GID
  `1000` in the official Node images) needs no `chown`. Bind mounts get no copy-up.
- **Postgres image**: the entrypoint, started as root, takes ownership of its data directory, so a
  bind mount at `/var/lib/postgresql` needs no manual `chown`.
- **valkey-cli** reads the password from `VALKEYCLI_AUTH`, falling back to the legacy
  `REDISCLI_AUTH` (`src/valkey-cli.c`: `#define CLI_AUTH_ENV "VALKEYCLI_AUTH"`,
  `#define OLD_CLI_AUTH_ENV "REDISCLI_AUTH"`). The Valkey docs document only `VALKEYCLI_AUTH`, so the
  spec uses that. Prefix the check with `| grep -q PONG`, because valkey-cli can exit `0` on an error
  reply.
- **Coolify health checks** (coolify.io/docs/applications/configuration/health-checks):
  - Dashboard checks run inside the container. The `HTTP` type needs `curl` or `wget` in the
    image. The `CMD` type runs a single command, and shell operators (`;`, `|`, `&`, `$()`, `>`,
    `<`) are not allowed.
  - An enabled dashboard check replaces the image `HEALTHCHECK`. When it is disabled, the image
    check is used.
  - Traefik removes unhealthy containers from routing (404 or "No available server" when none is
    healthy), and rolling updates wait for the new container's check, "configured in Coolify or the
    image".
  - Changing the check needs a redeploy.
- **Coolify persistent storage** (coolify.io/docs/knowledge-base/persistent-storage): Configuration →
  Persistent Storage → Add → **Volume Mount** (Name, Destination Path) or **Directory Mount** (Source
  Path, Destination Path; a bind mount that Coolify creates when needed). Coolify does not change
  ownership.
- **Coolify network aliases**: application network aliases exist for Docker Image apps (beta release
  note: "Custom network aliases for interconnectivity of services deployed with rolling release";
  API field `custom_internal_name`). Container names change per rolling deploy, so the edge must
  target an alias.

## 2. Design text (paste into design.md → t4b section, after decision 9)

10. **One variable per persistent data location (D5).**
    - Decision: how compose persists photos, the database and backups when S3 is not configured.
    - Choice:
      - Short-syntax mounts `${UPLOADS_SOURCE:-uploads}:/app/uploads` (api and restore; read-only
        `/uploads` in backup), `${POSTGRES_DATA_SOURCE:-postgres_data}:/var/lib/postgresql` and
        `${BACKUPS_SOURCE:-backups}:/backups`.
      - Top-level `volumes:` declares `uploads`, `postgres_data`, `backups` and `valkey_data`.
        Compose's own source rule then decides the type: a value starting with `/`, `.` or `~` is a
        host folder, any other value is a declared named volume, and an undeclared name fails
        `docker compose config`.
      - `UPLOAD_DIR` is the literal `/app/uploads`.
      - Valkey keeps a fixed named volume, because its data is disposable.
    - Alternatives:
      - A second override file for bind mounts (`-f compose.bind.yml`): another file, and operators
        forget the flag.
      - Long syntax with `type: ${UPLOADS_TYPE}`: two variables that can disagree.
      - A host folder by default (`./uploads`): Docker creates it root-owned, so every fresh install
        would fail fast until someone runs `chown`.
      - An init container that `chown`s on every start: runs as root on each boot and silently
        changes ownership of a host folder the operator picked.
    - Rationale:
      - One variable cannot be half-configured.
      - The default needs zero steps, because a new named volume inherits the image's `node`
        ownership.
      - The rule is Compose's documented behaviour (compose-go `isFilePath`), not ours.
11. **Bind-mount ownership: fail fast, one-command fix.**
    - Decision: what happens when the uploads host folder is not writable by the non-root API.
    - Choice:
      - `verifyStorage` writes and deletes `.brewform-write-test-<pid>` instead of only calling
        `access(W_OK)`.
      - On failure it logs one error naming the directory, the UID/GID, the errno code,
        `chown -R 1000:1000 <volume or host folder>` and `make prod-fix-uploads-owner`, then exits
        `1` before listening.
      - `make prod-fix-uploads-owner` runs `chown` as root in a one-off api container, so it works
        for both source types.
      - The guide pre-creates folders with `sudo install -d -o 1000 -g 1000 -m 0750 <path>` and
        covers SELinux relabelling and rootless/userns UID mapping.
      - Postgres needs no step (its entrypoint takes ownership). Backups are written by root under
        `umask 077`.
    - Alternatives: running the API as root (reverts t4b hardening); `create_host_path: false` (long
      syntax only, so it breaks the single variable); a warning instead of an exit (photos would be
      lost silently).
    - Rationale: a real write catches every cause (mode bits, `:ro`, SELinux, NFS root squash) the
      same way, and the message carries the exact fix.
12. **Backups target a named volume by default; restore and export go through compose services.**
    - Decision: where dumps land, and how restore works for both source types.
    - Choice:
      - `BACKUPS_SOURCE` (default named volume `backups`; for example `./backups` for a host
        folder) replaces `BACKUP_DIR`.
      - A profile-gated one-shot `restore` service (postgres image, root) mounts the uploads source
        read-write and the backups source read-only. It validates `RESTORE_DB_DUMP` /
        `RESTORE_UPLOADS_ARCHIVE` against the dump/archive name patterns, runs
        `pg_restore --clean --if-exists --no-owner`, extracts the archive and runs
        `chown -R 1000:1000 /app/uploads`.
      - `make prod-restore DUMP=… UPLOADS=…` wraps it (stop api/web, run restore, `up -d`).
        `make prod-backup-export DEST=…` runs `docker compose cp backup:/backups/. <dest>`.
        Imports use `docker compose cp <file> backup:/backups/`.
    - Alternatives: host `./backups` by default (root-owned dumps inside the checkout, and different
      commands per mode); hand-written `docker run` commands (need the project-prefixed volume names
      and differ between volume and folder).
    - Rationale: identical commands for a volume and a folder; name validation blocks path tricks;
      dumps are `0600`.
13. **Liveness and readiness contract (OQ4).**
    - Decision: what `/health` and `/ready` promise, so compose, the image, Coolify and monitors can
      rely on them.
    - Choice:
      - `/health`: no dependency checks, always `200 {"status":"ok"}` while serving.
      - `/ready`: a fixed set of keys `{ status, db, cache, rateLimitStore, storage, shuttingDown }`.
        `200` only when a Drizzle ping (`pingDatabase()`: `select id from user limit 1`, no row data
        read) settles within 2000 ms and the process is not shutting down. Concurrent probes share
        one in-flight ping. Valkey degradation keeps `200` (t2). `storage` (`ok`, `ephemeral`,
        `degraded`, `s3`) is informational only.
      - On SIGTERM/SIGINT a lifecycle flag flips `/ready` to `503` (`db: "skipped"`) before
        `server.close()`, and repeated signals are ignored.
      - Both probes: exempt from rate limiting (t2), `Cache-Control: no-store`, no `CacheProvider`
        access, no `info`+ log per probe (one `warn`/`info` per readiness transition),
        `describeRoute` with shared `HealthOutputSchema`/`ReadinessOutputSchema`, bare JSON (no
        envelope).
      - The code moves to `apps/api/src/modules/health/{model,service,index}.ts`, so no route
        imports `drizzle-orm` and there is no raw SQL.
    - Alternatives: `503` on a Valkey outage (Valkey is optional; contradicts t2); counting storage
      in the status code (an unwritable volume would drop all traffic, not just uploads); new
      `/livez`/`/readyz` paths (docs and Coolify already use the current ones).
    - Rationale: orchestrators need a cheap, stable, bounded signal. Readiness that touches the
      schema also proves migrations ran.
14. **Every HEALTHCHECK probes readiness through one bundled Node script (supersedes the `/health`
    image probe in decision 6).**
    - Decision: what the images, compose and Coolify run as their health check.
    - Choice:
      - `/app/healthcheck.mjs` (from `apps/api/scripts/healthcheck.mjs`): no imports beyond Node
        built-ins, path argument (default `/ready`, validated), 4 s fetch timeout, exit `0` only on
        `200`.
      - API image: `HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --start-interval=2s --retries=3 CMD ["node","/app/healthcheck.mjs","/ready"]`.
      - Web image: exec-form BusyBox `wget` on `/healthz` (`--interval=30s --timeout=3s --start-period=10s --start-interval=1s --retries=3`).
      - Compose declares checks on every long-running service with the timings in the
        production-operations table: postgres `pg_isready -d`, valkey via `VALKEYCLI_AUTH`, api
        `/ready`, web `/healthz`, backup freshness. `migrate` is gated with
        `service_completed_successfully`.
      - `/health` is proxied by the edge (exact path) for uptime monitors; `/ready` is not.
    - Alternatives:
      - Keep the image on `/health` (t4b): `depends_on` and Coolify rolling updates would pass
        before the database is reachable, and the image fallback would disagree with the Coolify
        check the user wants on readiness.
      - Install curl or wget in the API image: extra packages and CVE surface, against t4b
        hardening.
      - Inline `node -e "…"`: Coolify's CMD field forbids `;`/`|`, and the code would be copied
        into three places.
    - Rationale:
      - Docker has a single health status and never restarts a container because of it. Every
        consumer (Compose ordering, Coolify rollouts, Traefik routing) is a traffic gate, which is
        readiness.
      - Three retries 15 s apart absorb DB blips shorter than about 45 s.
      - Accepted trade-off: during a longer DB outage Traefik answers `404`/"No available server"
        instead of the API's `503`. The API could not serve those requests anyway.
15. **Exact Coolify settings, and local storage on Coolify.**
    - Decision: what operators type into Coolify.
    - Choice:
      - API Healthcheck: enabled, Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval
        15, Timeout 5, Retries 3, Start period 180.
      - Web Healthcheck: enabled, Type `HTTP`, `GET` `http` `localhost`, Port 80, Path `/healthz`,
        expected 200, Interval 30, Timeout 3, Retries 3, Start period 10.
      - Uptime monitors: `https://<api domain>/health` and `https://<web domain>/healthz`, never
        `/ready`.
      - Local storage: a Persistent Storage **Volume Mount** (`brewform-uploads` → `/app/uploads`),
        or a **Directory Mount** plus `sudo chown -R 1000:1000 <source>`.
      - Because local photo URLs are root-relative, local storage also needs an API network alias
        (`brewform-api`) and `API_UPSTREAM=brewform-api:8000` on the web resource.
    - Alternatives: an HTTP-type API check (fails without curl/wget); a disabled dashboard check
      (works through the identical image check, but the user wants to set it in Coolify; kept as the
      documented fallback); container-name upstreams (names change per rolling deploy).
    - Rationale: copyable values, the same probe everywhere, and photos that survive redeploys and
      actually load.
16. **CI publishes the images it smoke-tested (strengthens decision 8, U4).**
    - Decision: how to guarantee that publishing happens strictly after every check, with the
      tested bits.
    - Choice:
      - `publish.needs: [quality, test, images, doc-drift]`, with every need running on push
        events. `if: github.event_name == 'push'` without `always()`.
      - On push events `images` `docker save`s both tested images into a 1-day artifact and outputs
        their image IDs. `publish` loads them, compares the IDs, tags them with metadata-action tags
        and `docker push`es. No build happens in `publish`.
      - `images` also runs `scripts/ci/compose-config-check.sh` (jq over
        `docker compose config --format json`: health checks, conditions, `UPLOAD_DIR`, volume vs
        bind rendering, no passwords).
      - `scripts/ci/smoke-images.sh` is extended with `/health`, the `/ready` keys, both containers
        healthy through their own `HEALTHCHECK`, `/health` through the edge, and the
        root-owned/1000-owned bind-mount pair.
      - `scripts/ci/smoke-compose.sh` runs the whole production stack with the built images: all
        services healthy, `migrate` exited 0, PNG survives `--force-recreate api`, backup dump and
        archive valid, graceful stop exits 0.
    - Alternatives: rebuild in `publish` from the gha cache (t4b; a cache eviction silently ships an
      untested image); push a candidate tag from `images` and retag later (pushes before tests pass,
      which the user ruled out with "sequential").
    - Rationale: the user's rule ("publish only after all CI jobs pass, never in parallel") becomes
      checkable: the job timeline and the image IDs prove it.

**Risks / Trade-offs to add (t4b block):**
- [Readiness-based health means Traefik drops the API during a DB outage longer than about 45 s] → Accepted; the API could not serve those requests, and the container returns to routing at the first successful probe.
- [`/ready` is publicly reachable on the Coolify API domain and reveals component states] → Accepted; it carries no secrets or versions. Operators can block it at Traefik if they want.
- [Coolify's `CMD` health-check type or the network-alias field is missing on an older Coolify] → Fallbacks: disable the dashboard check (the image `HEALTHCHECK` is identical); use S3 instead of local storage on Coolify.
- [The image artifact adds about 1–2 minutes to `main` runs] → Only on push events; PR runs skip the upload.
- [The compose smoke test adds about 3 minutes to every PR] → Runs in parallel with `test`; superseded PR runs are cancelled.
- [A host folder on SELinux or rootless Docker is not writable even after `chown 1000:1000`] → The fail-fast message names the UID; the guide covers `chcon` and UID mapping; the named-volume default avoids it.

## 3. Tasks to add

### Group 3 (api-env-config)
(No new tasks; 3.5–3.7 are rewritten in section 4.)

### Group 19 (insert after 19.4, in this order)

- [ ] 19.? Write failing tests for the probe response schemas in `packages/shared/src/schemas/responses/health.test.ts`: `HealthOutputSchema` accepts only `{ status: 'ok' }`; `ReadinessOutputSchema` (`.strict()`) accepts `{ status: 'ready'|'not_ready', db: 'connected'|'disconnected'|'skipped', cache: 'ok'|'degraded'|'memory'|'disabled', rateLimitStore: same enum, storage: 'ok'|'ephemeral'|'degraded'|'s3', shuttingDown: boolean }` and rejects extra keys and unknown values. Then add `packages/shared/src/schemas/responses/health.ts` (JSDoc on both exports) and export both from the responses index. Run `make test-shared` and `make check`.
- [ ] 19.? Write `apps/api/src/utils/lifecycle.test.ts` first, then add `apps/api/src/utils/lifecycle.ts` with JSDoc:
  - Exports: `markShuttingDown()`, `isShuttingDown()`, `resetLifecycleForTests()` and `createShutdownHandler({ closeServer, closeDb, closeTransporter, closeCache, exit, log })`.
  - The handler's first call sets the flag before `closeServer` runs, then closes the server, database, transporter and cache in that order with the existing log lines (`Shutting down gracefully...` … `Graceful shutdown complete`), then calls `exit(0)`.
  - A second call logs at `debug` and returns without closing anything.
  - A rejecting step logs `error` with `err` and calls `exit(1)`.
  - In `apps/api/src/main.ts`, build the SIGTERM/SIGINT handler with `createShutdownHandler` and keep the logger name `main`.
  - Update the shutdown-sequence JSDoc to "mark not ready → close HTTP server → database → email transporter → cache → exit".
- [ ] 19.? Write failing tests for the health module.
  - `apps/api/src/modules/health/service.test.ts` calls `getReadiness(deps)` with injected `ping`, `getCacheStatus`, `getRateLimitStoreStatus`, `checkStorageHealth`, `isShuttingDown` and `log`, and asserts:
    - a healthy setup returns HTTP 200 and the exact body `{ status: 'ready', db: 'connected', cache: 'memory', rateLimitStore: 'memory', storage: 'ok', shuttingDown: false }`;
    - a rejecting `ping` gives 503 with `db: 'disconnected'`;
    - a `ping` that never settles gives 503 after 2000 ms (`vi.useFakeTimers()`);
    - ten concurrent calls while one ping is pending call `ping` once;
    - when shutting down, the result is 503 with `db: 'skipped'` and `shuttingDown: true`, and `ping` is never called;
    - a degraded cache and rate-limit store still give 200;
    - each storage value passes through;
    - a ready→not_ready change logs exactly one `warn` with `{ db, shuttingDown }`, the recovery logs one `info`, and repeated identical results log nothing above `debug`.
  - `apps/api/src/modules/health/index.test.ts` uses `app.request` on the real app with the service mocked through `vi.mock` and asserts:
    - `/health` returns 200 `{"status":"ok"}` with `Cache-Control: no-store`;
    - `/ready` mirrors the service status and body with `no-store`;
    - 150 `/ready` requests in a row never return 429;
    - with `OPENAPI_ENABLED=true`, `/api/v1/openapi.json` lists `GET /health` and `GET /ready` under tag `Health`, with 200 (and 503 for `/ready`) response schemas.
- [ ] 19.? Implement the health module.
  - `apps/api/src/modules/health/model.ts`: `pingDatabase()`, which runs `db.select({ id: users.id }).from(users).limit(1)`. Its docblock says it is a connectivity probe that reads no row data and also fails on an unmigrated schema.
  - `service.ts`: `getLiveness()` and `getReadiness(deps = defaultHealthDeps)` with `READINESS_DB_TIMEOUT_MS = 2000`, a single-flight ping promise and transition logging. It uses the module logger `createLogger('health')` with entry/exit `debug` logs, and its imports are `pingDatabase` from `./model.ts`, `getCacheStatus()` (task 6.34), `getRateLimitStoreStatus()` (t2, task 6.36), `checkStorageHealth()` (task 3.6) and `isShuttingDown()`. No `drizzle-orm` import.
  - `index.ts`: a Hono router with `describeRoute({ tags: ['Health'], summary, description, responses })` on both routes. The responses are `resolver(HealthOutputSchema)` (200) and `resolver(ReadinessOutputSchema)` (200 and 503). Both routes call `c.header('Cache-Control', 'no-store')`.
  - Mount the router with `routes.route('/', health)` in `apps/api/src/routes/index.ts` and update its docblock.
  - Delete `apps/api/src/routes/health.ts` and the tautological `apps/api/src/routes/health.test.ts`, carrying t2's task-6.36 `memory`/`degraded` cases into the new tests.
  - Run `make test-specific filter=src/modules/health`, `make test-specific filter=src/routes/openapi.coverage.test.ts` and `make check-api`.
- [ ] 19.? Write `apps/api/src/modules/health/probe.test.ts` first, then add `apps/api/scripts/healthcheck.mjs`.
  - The test starts a `node:http` server on an ephemeral port and spawns `process.execPath` with `fileURLToPath(new URL('../../../scripts/healthcheck.mjs', import.meta.url))` and `APP_PORT` set.
  - It asserts these exit codes:
    - a 200 response exits 0;
    - a 503 response exits 1;
    - a closed port exits 1;
    - a server that never answers exits 1 within 5 s;
    - the argument `http://example.com/` exits 1 and no request reaches the server.
  - The script uses no imports beyond Node built-ins. It takes a path argument (default `/ready`) that must match `^/[A-Za-z0-9/_-]*$`, and calls `fetch('http://127.0.0.1:' + (process.env.APP_PORT || 8000) + path, { signal: AbortSignal.timeout(4000) })`.
  - It exits 0 only on status 200. Otherwise it writes one stderr line with the status or error name and exits 1.
  - Add a header docblock naming its three callers: the image `HEALTHCHECK`, the compose healthcheck and the Coolify CMD check.

### Group 20 (insert where noted)

- [ ] 20.? (before 20.8, failing first) Add `scripts/ci/compose-smoke.env` and `scripts/ci/compose-config-check.sh`.
  - `compose-smoke.env` holds placeholder values: `POSTGRES_PASSWORD=ci-postgres-pw`, `VALKEY_PASSWORD=ci0valkey0pw`, `JWT_SECRET=ci-jwt-secret-0123456789`, `ADMIN_PASSWORD=ci-admin-pw-123`, `WEB_DOMAIN=localhost`, `WEB_PORT=8088`, `API_IMAGE=brewform-api`, `WEB_IMAGE=brewform-web`, `IMAGE_TAG=ci`.
  - `compose-config-check.sh` is POSIX sh with `set -eu`, `docker compose` and `jq`. It runs `docker compose -p brewform-ci --env-file scripts/ci/compose-smoke.env -f compose.production.yml config --format json` and asserts:
    - `postgres`, `valkey`, `api`, `web` and `backup` each have `.healthcheck.test`;
    - `api.depends_on` has `migrate: service_completed_successfully`, `postgres: service_healthy` and `valkey: service_healthy`;
    - `web.depends_on.api.condition == "service_healthy"`;
    - `migrate.depends_on.postgres.condition == "service_healthy"`;
    - `api.environment.UPLOAD_DIR == "/app/uploads"`;
    - the api mount at `/app/uploads` has `type == "volume"` and `source == "uploads"`;
    - when re-rendered with `UPLOADS_SOURCE=./ci-data/uploads`, that mount has `type == "bind"` and an absolute source ending in `/ci-data/uploads`, and the backup mount at `/uploads` is `read_only`;
    - `UPLOADS_SOURCE=photos` makes `config` fail;
    - no `healthcheck.test`, `command` or `entrypoint` string contains `ci0valkey0pw` or `ci-postgres-pw`;
    - `restore` appears only with `--profile restore`.
  - Run it now and confirm it fails against the current file.
- [ ] 20.? (after 20.12) Add the `restore` one-shot service: `profiles: ["restore"]`, `image: postgres:18-trixie`, `restart: "no"`, the logging anchor, `deploy.resources.limits.memory: 512m`, and `depends_on: postgres: service_healthy`.
  - Environment: `PGHOST=postgres`, plus `PGUSER`, `PGPASSWORD` and `PGDATABASE` from the `POSTGRES_*` values, plus `RESTORE_DB_DUMP` and `RESTORE_UPLOADS_ARCHIVE`.
  - Volumes: `${UPLOADS_SOURCE:-uploads}:/app/uploads` and `${BACKUPS_SOURCE:-backups}:/backups:ro`.
  - The inline `sh -euc` script:
    - validates `RESTORE_DB_DUMP` against `^db-[0-9]{8}T[0-9]{6}Z\.dump$` and `RESTORE_UPLOADS_ARCHIVE` against `^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$` with `grep -Eq`, printing the expected pattern and exiting 2 on a mismatch;
    - runs `pg_restore --clean --if-exists --no-owner -d "$PGDATABASE" "/backups/$RESTORE_DB_DUMP"` when a dump name is set;
    - runs `tar -xzf "/backups/$RESTORE_UPLOADS_ARCHIVE" -C /app/uploads` and then `chown -R 1000:1000 /app/uploads` when an archive name is set;
    - prints one line per step.
- [ ] 20.? (after 20.13) Declare the top-level `volumes:` `postgres_data`, `valkey_data`, `uploads` and `backups`, with a comment that explains the `*_SOURCE` rule. Run `scripts/ci/compose-config-check.sh` until it passes.

### Group 21 (insert where noted)

- [ ] 21.? (after 21.3) Add `scripts/ci/smoke-compose.sh` (POSIX sh, `set -eu`, `trap` that prints `docker compose logs` on failure and always runs `down -v`). It takes the env file and project name as arguments (defaults `scripts/ci/compose-smoke.env`, `brewform-ci`) and does the following:
  - Runs `docker compose … up -d`. It then polls `docker compose ps --format json` until `postgres`, `valkey`, `api`, `web` and `backup` are `healthy` and `migrate` has exited with code 0, and fails after 300 s.
  - Checks through `http://127.0.0.1:${WEB_PORT}` that `/healthz` returns 200 and `/health` returns `{"status":"ok"}`.
  - Runs `docker compose exec -T api node /app/healthcheck.mjs /ready`, which must exit 0.
  - Writes a 1×1 PNG with `docker compose exec -T -u node api node -e "require('node:fs').writeFileSync('/app/uploads/ci-probe.png', Buffer.from('<base64>','base64'))"`.
  - Runs `up -d --force-recreate api` and waits for `healthy`. Then `GET /uploads/ci-probe.png` through the web port must return 200 with `image/png`.
  - Runs `docker compose run --rm -e BACKUP_ONESHOT=1 backup`. In the backup container, `ls /backups` must show `db-*.dump` and `uploads-*.tar.gz`, `pg_restore --list` must succeed on the dump, and `tar -tzf` must list `ci-probe.png`.
  - Runs `docker compose stop api`. The api exit code (`docker inspect`) must be 0, and its logs must contain `Graceful shutdown complete`.
  - Run it locally against the `:local` images with `IMAGE_TAG=local`.

## 4. Tasks to modify or remove

- **3.5** → `- [ ] 3.5 Write failing unit tests in apps/api/src/utils/storage/startup.test.ts for verifyStorage(config, fsDeps, log)`, with injected `mkdir`, `writeFile`, `unlink`, `stat` and `access`. The tests cover:
  - It creates a missing directory (`mkdir` with `recursive: true`).
  - It writes and then unlinks `<dir>/.brewform-write-test-<pid>`.
  - It logs info `{ storageDriver: 'local', uploadDir }` and returns `{ storageDriver: 'local', uploadDir, mounted: true }`.
  - When `writeFile` rejects with `EACCES`, and separately with `EROFS`, it throws `StorageStartupError`. The message contains the directory, `uid <n> gid <n>`, the error code, `chown -R 1000:1000` and `make prod-fix-uploads-owner`.
  - When `APP_ENV=production` and `stat(dir).dev === stat(parent).dev`, it warns once and returns `mounted: false`. It never warns outside production.
  - For `s3` it logs `{ storageDriver: 's3', bucket }`, never calls the fs deps and never logs keys.
  - `checkStorageHealth(config, { access })` returns:
    - `ok` when `access(W_OK)` resolves after a mounted result;
    - `ephemeral` after a `mounted: false` result;
    - `degraded` when `access` rejects;
    - `s3` without calling `access`.
- **3.6** → `- [ ] 3.6 Implement apps/api/src/utils/storage/startup.ts` (`verifyStorage`, `checkStorageHealth`, `StorageStartupError`, a module-level record of the last `mounted` result, and `resetStorageStartupStateForTests()`).
  - Logging: module logger `createLogger('storage-startup')`, entry/exit debug logs, `err` on error logs, no secrets or file contents.
  - Export all of them from `apps/api/src/utils/storage/index.ts`.
  - Run `make test-specific filter=src/utils/storage/startup.test.ts` until green.
- **3.7** → `- [ ] 3.7 Call verifyStorage in startup() in apps/api/src/main.ts before serve()`.
  - On `StorageStartupError`, run `log.error({ err, uploadDir: config.UPLOAD_DIR, uid: process.getuid?.(), gid: process.getgid?.() }, err.message)` and `process.exit(1)`.
  - Update the startup-sequence JSDoc at the top of `main.ts`.
- **19.6** → `- [ ] 19.6 In Dockerfile:`
  - Remove `RUN pnpm --filter @brewform/db run generate`.
  - Add a `prod-deps` stage: `FROM builder`, `pnpm install --prod --frozen-lockfile --offline`, then `rm -rf apps/web openspec plans docs` plus the test and coverage dirs.
  - Rebuild `runner` to copy only `package.json`, `pnpm-workspace.yaml`, `node_modules`, `apps/api`, `packages/db`, `packages/shared` and `files` from `prod-deps`, without the global pnpm install.
  - Install `tini` with `apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*`.
  - Set `ENV NODE_ENV=production UPLOAD_DIR=/app/uploads` and run `RUN mkdir -p /app/uploads && chown node:node /app/uploads`.
  - Add `COPY apps/api/scripts/healthcheck.mjs /app/healthcheck.mjs`, then `USER node` and `ENTRYPOINT ["/usr/bin/tini","-g","--","/app/docker-entrypoint.sh"]`.
  - Add `HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --start-interval=2s --retries=3 CMD ["node", "/app/healthcheck.mjs", "/ready"]`.
  - Update the stage comments at the top of the file. They must say the image probes readiness and that `/health` is for uptime monitors.
- **19.7** → `- [ ] 19.7 Verify locally:`
  - Run `make images`.
  - Run `docker run --rm --entrypoint sh brewform-api:local -c 'id -u; ls /app; test ! -e /app/apps/web; test -f /app/files/scaa-2.json; test -f /app/packages/db/drizzle/meta/_journal.json; test -f /app/healthcheck.mjs; ! command -v curl; ! command -v wget'`. `id -u` must print `1000`.
  - `docker inspect --format '{{json .Config.Healthcheck}}' brewform-api:local` must show `["CMD","node","/app/healthcheck.mjs","/ready"]` with the 15s/5s/180s/2s/3 values.
  - Confirm that `vitest`, `typescript`, `vite` and `drizzle-kit` cannot be resolved from `/app/apps/api`.
  - Compare the image size before and after in the PR description.
- **20.1** → `- [ ] 20.1 Restructure apps/web/Caddyfile`:
  - a global block (`admin off`, `import /etc/caddy/global.d/*.caddy`);
  - `:80` with `encode zstd gzip`;
  - `handle /healthz { header Cache-Control "no-store"; respond "ok" 200 }`, a local liveness answer that never touches the upstream;
  - `import /etc/caddy/conf.d/*.caddy`;
  - a fallback `handle` holding the existing root, `/config.js` no-store, `try_files` and `file_server`.
  - Leave the static `handle` as the slot for the security-headers work.
- **20.2** → same text as today, with one change: the proxy matcher becomes `path /api/* /uploads/* /share/* /health`. `/health` is an exact path, and `/ready` is deliberately not proxied. Also add the CI check that `/health` through the edge returns the API JSON (task 21.3).
- **20.3** → `- [ ] 20.3 In Dockerfile.web runner:`
  - `RUN mkdir -p /etc/caddy/conf.d /etc/caddy/global.d`.
  - Re-declare `ARG VITE_PUBLIC_APP_URL=http://localhost:8080` and set `ENV BREWFORM_BUILD_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL`.
  - Add `HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s --retries=3 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]` in exec form, using the BusyBox `wget` of the Alpine base. Confirm `docker run --rm --entrypoint sh brewform-web:local -c 'command -v wget'` prints a path.
  - Update the stage comments.
- **20.8** → `- [ ] 20.8 Rewrite compose.production.yml:`
  - `name: brewform-prod` and an `x-logging` anchor.
  - An `x-api-env` anchor: the existing api env plus the literal `UPLOAD_DIR: /app/uploads`, which is never interpolated; `S3_*` without `:-` defaults; t2's `TRUST_PROXY: ${TRUST_PROXY:-hops}`, `TRUST_PROXY_HOPS: ${TRUST_PROXY_HOPS:-1}` and `RATE_LIMIT_STORE: ${RATE_LIMIT_STORE:-redis}`, coordinated with t2; and t7's optional `DB_STATEMENT_TIMEOUT_MS` passthrough (task 10.27).
  - Image refs: `${API_IMAGE:-ghcr.io/ardakilic/brewform-api}:${IMAGE_TAG:-latest}` and the web equivalent.
  - Data mounts: `${POSTGRES_DATA_SOURCE:-postgres_data}:/var/lib/postgresql` on postgres, `${UPLOADS_SOURCE:-uploads}:/app/uploads` on api, `valkey_data:/data` on valkey.
  - Drop the `API_DOMAIN` requirement.
- **20.9** → `- [ ] 20.9 Add the migrate one-shot service` (`command: ["migrate"]`, `restart: "no"`, `depends_on: postgres: condition: service_healthy`, logging anchor, 512m limit).
  - The `api` service depends on `migrate: service_completed_successfully`, `postgres: service_healthy` and `valkey: service_healthy`.
  - The `api` service sets `RUN_MIGRATIONS: "false"` and `stop_grace_period: 30s`.
  - Its healthcheck is `test: ["CMD", "node", "/app/healthcheck.mjs", "/ready"]`, `interval: 15s`, `timeout: 5s`, `retries: 3`, `start_period: 60s`, `start_interval: 2s`.
- **20.10** → `- [ ] 20.10 Web service:` `VITE_API_URL: ${VITE_API_URL:-/api/v1}`, `API_UPSTREAM: api:8000`, `PUBLIC_APP_URL: https://${WEB_DOMAIN}` and `TRUSTED_PROXIES: ${TRUSTED_PROXIES-private_ranges}` (unset gives the default, empty disables). It also gets `depends_on: api: condition: service_healthy` and a healthcheck: `test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]`, `interval: 30s`, `timeout: 3s`, `retries: 3`, `start_period: 10s`.
- **20.11** → `- [ ] 20.11 Valkey:`
  - Generate the config in `sh -c` from env (`requirepass`, `maxmemory ${VALKEY_MAXMEMORY:-192mb}`, policy left at `noeviction`), written to `/tmp/valkey.conf`, then exec the official entrypoint.
  - Service `environment` holds `VALKEY_PASSWORD` and `VALKEYCLI_AUTH: ${VALKEY_PASSWORD:?…}`.
  - Healthcheck: `test: ["CMD-SHELL", "valkey-cli ping | grep -q PONG"]`, `interval: 10s`, `timeout: 3s`, `retries: 5`, `start_period: 10s`.
  - Postgres healthcheck: `test: ["CMD-SHELL", "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\""]`, `interval: 10s`, `timeout: 5s`, `retries: 5`, `start_period: 30s`.
- **20.12** → `- [ ] 20.12 Add the backup service:`
  - An inline `sh -euc` loop on `postgres:18-trixie` with `umask 077`.
  - `PGHOST`, `PGUSER`, `PGPASSWORD` and `PGDATABASE` come from the `POSTGRES_*` values, plus `BACKUP_INTERVAL_SECONDS` (86400), `BACKUP_RETENTION_DAYS` (14), `BACKUP_UPLOADS` (true) and `BACKUP_ONESHOT`.
  - Volumes: `${BACKUPS_SOURCE:-backups}:/backups` and `${UPLOADS_SOURCE:-uploads}:/uploads:ro`.
  - Each run writes `pg_dump -Fc` to `/backups/.db-<ts>.partial` and renames it to `db-<ts>.dump` (timestamp format `%Y%m%dT%H%M%SZ`, UTC). The uploads tarball follows the same `.partial`-then-rename rule. Pruning uses `find /backups -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +$BACKUP_RETENTION_DAYS -delete`.
  - `depends_on: postgres: service_healthy`.
  - Healthcheck: `test: ["CMD-SHELL", "find /backups -maxdepth 1 -name 'db-*.dump' -mmin -$$(( $$BACKUP_INTERVAL_SECONDS / 30 )) | grep -q ."]`, `interval: 60s`, `timeout: 10s`, `retries: 3`, `start_period: 600s`.
  - No `BACKUP_DIR` variable exists.
- **20.15** → `- [ ] 20.15 Verify:`
  - `scripts/ci/compose-config-check.sh` passes.
  - `docker compose --env-file .env.production.example -f compose.production.yml config` renders with placeholder values, and an unset `API_DOMAIN` does not error.
  - `make prod-smoke` reaches all-healthy on a clean machine.
  - Manual pass:
    - sign in through `http://localhost` and upload a photo;
    - run `make prod-down && make prod-up` and confirm the photo still loads;
    - set `UPLOADS_SOURCE=./data/uploads` after `sudo install -d -o 1000 -g 1000 ./data/uploads`, recreate, and confirm a new upload lands in `./data/uploads`;
    - delete and re-create the folder as root and confirm that the api exits with the `not writable by uid 1000 gid 1000` log, and that `make prod-fix-uploads-owner && make prod-up` recovers.
  - `docker top` and the healthcheck commands show no Valkey or Postgres password.
  - `make prod-backup` writes `db-*.dump` and `uploads-*.tar.gz` (check with `make prod-backup-export DEST=./backup-export`).
- **20.16** → `- [ ] 20.16 Restore drill:`
  - Copy that dump and archive into a second fresh project (`COMPOSE_PROJECT_NAME=brewform-drill`) with `docker compose cp <file> backup:/backups/`.
  - Run `make prod-restore DUMP=<dump> UPLOADS=<archive>`.
  - Compare recipe and user counts, and load a restored photo.
  - Repeat with `UPLOADS_SOURCE` and `BACKUPS_SOURCE` set to host folders.
  - Paste both results into the PR.
- **21.2** → `- [ ] 21.2 In Makefile:`
  - `images` tags `brewform-api:local`/`brewform-web:local`.
  - Add `PROD_COMPOSE` and a `prod-env-check` prerequisite.
  - Add the targets `prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`, `prod-backup` (`$(PROD_COMPOSE) run --rm -e BACKUP_ONESHOT=1 backup`), `prod-backup-export` (`DEST ?= ./backup-export`; `mkdir -p $(DEST) && $(PROD_COMPOSE) cp backup:/backups/. $(DEST)`) and `prod-restore`. `prod-restore` takes `DUMP`/`UPLOADS` and runs `$(PROD_COMPOSE) stop api web`, then `$(PROD_COMPOSE) --profile restore run --rm -e RESTORE_DB_DUMP=$(DUMP) -e RESTORE_UPLOADS_ARCHIVE=$(UPLOADS) restore`, then `$(PROD_COMPOSE) up -d`.
  - Add `prod-fix-uploads-owner` (`$(PROD_COMPOSE) run --rm --no-deps --user 0:0 --entrypoint chown api -R 1000:1000 /app/uploads`) and `prod-smoke` (`images`, then `IMAGE_TAG=local API_IMAGE=brewform-api WEB_IMAGE=brewform-web scripts/ci/smoke-compose.sh`).
  - Each target gets a `##` help line.
  - Delete `images-push`, `release` and `prod-up-build`, and update `.PHONY` and the "Production Images & Deploy" comment block.
  - Check `make help`, plus `make prod-up` without `.env.production` (expect a clear error) and `make release` (expect no such target).
- **21.3** → `- [ ] 21.3 Add scripts/ci/smoke-images.sh` (throwaway network, `trap` cleanup, log dump on failure). It runs these checks:
  - Start `postgres:18-trixie`. Start the API with `APP_ENV=production`, test secrets and a named volume at `/app/uploads`, without a health-check override, and wait ≤180 s for the API container's own health status to become `healthy`.
  - Assert that `id -u` is `1000`, that `GET /health` returns `{"status":"ok"}`, and that `GET /ready` returns 200 with exactly the keys `status, db, cache, rateLimitStore, storage, shuttingDown` and `status: "ready"` (checked with `jq`).
  - Start the web image with `API_UPSTREAM`, wait for `healthy`, and assert:
    - `/healthz` returns 200;
    - `/` contains `id="root"`;
    - `/health` through the edge returns the API JSON;
    - `/api/v1/sitemap.xml` is XML.
  - Run the echo-upstream client-IP checks.
  - Negative bind-mount check: start the API with `RUN_MIGRATIONS=false`, an unreachable `DATABASE_URL` and `/app/uploads` bind-mounted from `mktemp -d` owned by root with mode 0755 (`sudo chown root:root`). Assert exit code 1 and the log `is not writable by uid 1000 gid 1000`.
  - Positive bind-mount check: same container with the directory chowned to `1000:1000` (`sudo chown 1000:1000`) and the real database; it must become `healthy`.
  - Run `scripts/ci/web-entrypoint.test.sh`.
  - Run the script locally against the `:local` images.
- **21.4** → `- [ ] 21.4 Rewrite .github/workflows/ci.yml:`
  - Basics: `name: CI`; triggers `pull_request` (main) and `push` (main, tags `v*`); top-level `permissions: contents: read`; concurrency group `ci-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
  - Keep `quality` and `test`. Only `test` gets `actions: read` and `pull-requests: write`.
  - Add `images` (`needs: quality`, `timeout-minutes: 40`):
    - Set up buildx. Run `docker/metadata-action` for OCI labels only.
    - Two `docker/build-push-action` builds with `load: true`, tags `brewform-api:ci`/`brewform-web:ci`, per-image gha cache scopes (`cache-to … mode=max,ignore-error=true`), and the web build args `${{ github.event_name == 'push' && secrets.VITE_API_URL || '/api/v1' }}` / `${{ github.event_name == 'push' && secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}`.
    - Then run `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` and `scripts/ci/smoke-compose.sh`.
    - On `push` events only: record both image IDs as job outputs (`docker image inspect --format '{{.Id}}'`), then `docker save brewform-api:ci brewform-web:ci | gzip > images.tar.gz` and `actions/upload-artifact` (name `images-${{ github.sha }}`, `retention-days: 1`).
  - Add `publish` (`needs: [quality, test, images, doc-drift]`, `if: github.event_name == 'push'` with no `always()`, `permissions: contents: read, packages: write`, `timeout-minutes: 20`):
    - `actions/download-artifact`, `gunzip -c images.tar.gz | docker load`, then fail unless both loaded IDs equal `needs.images.outputs.*`.
    - `docker/login-action` to GHCR.
    - `docker/metadata-action` per image (`images: ghcr.io/${{ github.repository_owner }}/brewform-<img>`; tags `type=raw,value=latest,enable={{is_default_branch}}`, `type=sha,format=long,prefix=`, `type=ref,event=tag`).
    - A shell loop that runs `docker tag` and `docker push` for every tag. No build step.
  - Remove the stale "Images are deployed via the Release workflow" comment.
  - Confirm the `doc-drift` job (task 27.6) has no pull-request-only `if:`.
- **21.7** → task 21.7 as written, plus:
  - A **Data storage** section:
    - the `UPLOADS_SOURCE`/`POSTGRES_DATA_SOURCE`/`BACKUPS_SOURCE` table and Compose's `/`, `.`, `~` rule;
    - named-volume defaults and where Docker keeps them;
    - host-folder setup (`sudo install -d -o 1000 -g 1000 -m 0750 ./data/uploads`; Postgres needs no chown);
    - SELinux `chcon -Rt container_file_t` and the rootless/userns UID note;
    - `make prod-fix-uploads-owner`;
    - `docker compose down -v` deletes named volumes but not host folders.
  - A **Health checks** section:
    - the per-service table (test, interval, timeout, retries, start period);
    - `/health` versus `/ready` semantics and the `/ready` JSON keys;
    - uptime monitors use `https://<WEB_DOMAIN>/health` and `/healthz`, never `/ready`.
  - Backups go to the named `backups` volume by default (`BACKUPS_SOURCE=./backups` for a host folder), with `make prod-backup-export` before `rsync`/`rclone`.
  - The restore runbook uses `make prod-restore DUMP=… UPLOADS=…`, with imports through `docker compose cp <file> backup:/backups/`.
  - The pre-wave-6 upgrade section uses the exact rescue commands from the production-operations "Upgrade notes" requirement: `docker compose cp` out before `git pull`, then the `docker compose run --rm --no-deps --user 0:0 --entrypoint sh -v "$PWD/uploads-rescue:/rescue:ro" api -c 'cp -a /rescue/. /app/uploads/ && chown -R 1000:1000 /app/uploads'` copy-in.
- **21.8** → task 21.8 with the clause "§6 step 4 disables the dashboard Healthcheck for the API (image `HEALTHCHECK`, no curl/wget) and §7 notes the web image healthcheck" replaced by these items:
  - §6 step 4: API Healthcheck enabled, Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval 15, Timeout 5, Retries 3, Start period 180. Explain why it is `CMD` (the HTTP type needs curl/wget, which the image lacks) and that a disabled check falls back to the identical image `HEALTHCHECK`.
  - §7 step 4: web Healthcheck enabled, Type `HTTP`, Method `GET`, Scheme `http`, Host `localhost`, Port `80`, Path `/healthz`, expected code `200`, Interval 30, Timeout 3, Retries 3, Start period 10.
  - A **Monitoring** subsection: `https://api.brewform.cc/health` and `https://brewform.cc/healthz` for uptime monitors, never `/ready`. Changes need a redeploy.
  - §6 step 5 "Persistent Storage" becomes: none with `STORAGE_DRIVER=s3` (recommended). With `STORAGE_DRIVER=local`, use one of:
    - Persistent Storage → Add → **Volume Mount** (Name `brewform-uploads`, Destination Path `/app/uploads`);
    - **Directory Mount** (Source Path for example `/data/brewform/uploads`, Destination Path `/app/uploads`) plus `sudo chown -R 1000:1000 /data/brewform/uploads` on the server.
    Either way, set the API network alias `brewform-api` and the web `API_UPSTREAM=brewform-api:8000`, because local photo URLs are root-relative. Both resources must be on the same destination.
  - Coolify local-storage migration: `docker cp` the files out of `/app/apps/api/uploads` before redeploying, then `docker cp` them into `/app/uploads` and `docker exec -u 0 … chown -R 1000:1000 /app/uploads`.
  - A troubleshooting row for the `not writable by uid 1000 gid 1000` log and for `storage: "ephemeral"`.
  - Keep every other clause of 21.8 unchanged.
- **21.9** → task 21.9 with `BACKUP_*` changed to `BACKUP_INTERVAL_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_UPLOADS`. Also add commented `UPLOADS_SOURCE=uploads`, `POSTGRES_DATA_SOURCE=postgres_data` and `BACKUPS_SOURCE=backups`, with one comment line saying that a value starting with `/` or `./` is a host folder (uploads folder owned by `1000:1000`) and anything else must be a declared volume name. No `BACKUP_DIR` line.
- **21.13** → `- [ ] 21.13 t2 (rate limiting):` confirm that `/health` and `/ready` are exempt from the global limiter, including `/health` requests that arrive through the web edge. Confirm the edge contract (one `X-Forwarded-For` entry, `TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`), and merge t2's api env lines into the `x-api-env` anchor.
- **21.15** → `- [ ] 21.15 Group check:`
  - `make check` and `make lint` pass.
  - `make test-api` passes: env, storage startup, storage, health module, probe and lifecycle tests.
  - `make test-shared` (health schemas) and `make test-specific filter=migrate.test.ts` pass.
  - `make db-generate` prints "No schema changes, nothing to migrate".
- **21.16** → `- [ ] 21.16` `make images`, `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` and `make prod-smoke` (which runs `scripts/ci/smoke-compose.sh`) succeed locally.

## 5. Cross-folder requests

### 5.1 proposal.md

- In "### Production compose, env config and CI pipeline (t4b)", replace the second bullet ("The web Caddy can act as the single edge … `exec node`, and ships no web or dev tooling.") with:
  > - The web Caddy can act as the single edge (`API_UPSTREAM`) for same-origin `/api`, `/uploads`, `/share` and `/health`, with normalised client-IP headers and a runtime `PUBLIC_APP_URL`. The API image runs non-root with `tini` and `exec node`, and ships no web or dev tooling.
  > - Health and readiness everywhere: `GET /health` is liveness (no dependency checks) and `GET /ready` is readiness (a 2 s database ping; Valkey and storage state reported without failing; `503` while shutting down), both exempt from rate limiting and documented in OpenAPI. Both images declare a `HEALTHCHECK` (the API runs the bundled `node /app/healthcheck.mjs /ready`, the web runs `wget /healthz`), every long-running compose service has a health check, and the Coolify guide gives the exact dashboard settings.
  > - Without S3, uploads persist on a named volume by default. One variable (`UPLOADS_SOURCE`, likewise `POSTGRES_DATA_SOURCE` and `BACKUPS_SOURCE`) switches each location to a host folder. An unwritable folder stops startup with the exact `chown` fix, and `make prod-fix-uploads-owner` applies it.
- Replace the third bullet ("Compose gains healthchecks, … restore/upgrade/rollback runbook.") with:
  > - Compose gains a one-shot `migrate` service, restart policies, log rotation, memory limits, a `pg_dump` + uploads backup sidecar (named `backups` volume by default), a profile-gated `restore` service with `make prod-restore`, and a restore/upgrade/rollback runbook.
- Replace the fourth bullet's first sentence with:
  > **BREAKING** (CI): `release.yml` and `pr.yml` are deleted. One `ci.yml` builds and smoke-tests both images (standalone and as the full production compose stack) on every PR, and its `publish` job pushes the exact smoke-tested images to GHCR only after every other job has passed.
- Impact → APIs → Changed: replace "`/ready` (cache and limiter fields)" with "`/health` and `/ready` (fixed readiness keys `status`, `db`, `cache`, `rateLimitStore`, `storage`, `shuttingDown`; `503` while shutting down)".
- Impact → New env vars → Compose: replace `BACKUP_*` with `BACKUP_INTERVAL_SECONDS`, `BACKUP_RETENTION_DAYS`, `BACKUP_UPLOADS`, `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE`.
- Impact → API code → New modules and utilities: add `modules/health`, `utils/lifecycle.ts` and `apps/api/scripts/healthcheck.mjs`. In "Reworked", replace `routes/health.ts` with "`routes/health.ts` (moved to `modules/health`)".
- Impact → CI and infra: add `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-compose.sh` and `scripts/ci/compose-smoke.env`. Makefile: also `prod-restore`, `prod-backup-export` and `prod-fix-uploads-owner`.
- Modified Capabilities → `container-deployment`: append "; built-in readiness `HEALTHCHECK`s in both images; `/health` proxied by the edge". `ci-image-publishing`: append "; publish pushes the smoke-tested images (artifact hand-off), and the PR smoke test includes the production compose stack".
- New Capabilities → `production-operations`: replace the description with "the single production compose definition with one-variable data sources (named volume or host folder), liveness and readiness probes, health checks on every service, migrate service, limits, backups, restore service and runbooks."

### 5.2 design.md

- **t4b decision 2** ("Absolute upload directory, verified at startup"), replace the second bullet with:
  > - `utils/storage/startup.ts` exports `verifyStorage(config, { mkdir, writeFile, unlink, stat, access }, log)`. It creates the directory and proves writability by writing and deleting `.brewform-write-test-<pid>`. It warns when a production directory is not a mount point (comparing `stat().dev` with the parent) and records that for `/ready` (`storage: "ephemeral"`), and logs `{ storageDriver, uploadDir }` or `{ storageDriver: 's3', bucket }`. On failure it throws an error naming the directory, the UID/GID, the errno code and the `chown -R 1000:1000` / `make prod-fix-uploads-owner` fix. `main.ts` turns the throw into `process.exit(1)` before `serve()`. `checkStorageHealth()` serves `/ready`.
- **t4b decision 6**, replace "and declares a `node -e fetch(/health)` `HEALTHCHECK` (start-period 180s)." with "and declares `HEALTHCHECK … CMD ["node","/app/healthcheck.mjs","/ready"]` (interval 15s, timeout 5s, start-period 180s, start-interval 2s, retries 3; see decision 14)." Replace the last bullet ("The image probes `/health` because Coolify's Traefik drops unhealthy containers. Compose overrides the probe with `/ready` for startup ordering.") with:
  > - The image probes `/ready` (decision 14). Docker's single health status gates traffic and rollouts, never restarts, so it must mean readiness. `/health` serves uptime monitors.
- **t4b decision 7**:
  - Replace "api: `stop_grace_period: 30s` and a `/ready` healthcheck." with "api: `stop_grace_period: 30s` and the `node /app/healthcheck.mjs /ready` healthcheck (15s/5s/3/60s)."
  - Replace "web: depends on a healthy api and has a `/healthz` healthcheck." with "web: depends on a healthy api and has an exec-form `wget` `/healthz` healthcheck."
  - In the Valkey bullet, replace "the healthcheck authenticates via `VALKEYCLI_AUTH`" with "`VALKEYCLI_AUTH` is set in the service environment and the healthcheck runs `valkey-cli ping | grep -q PONG`."
  - Replace the Backup bullet with:
    > - Backup: an inline loop on `postgres:18-trixie` (`umask 077`) writes `pg_dump -Fc` to `.partial` and renames it, tars the read-only uploads source, prunes with `find -mtime`, writes to `${BACKUPS_SOURCE:-backups}` (named volume by default), has a freshness healthcheck, and supports `BACKUP_ONESHOT=1` for `make prod-backup`. A profile-gated `restore` service serves `make prod-restore` (decision 12).
  - Add a bullet: "Data mounts use one variable each: `${UPLOADS_SOURCE:-uploads}`, `${POSTGRES_DATA_SOURCE:-postgres_data}`, `${BACKUPS_SOURCE:-backups}` (decision 10)."
- **t4b decision 8**:
  - Replace "`images`: needs quality, runs in parallel with test. Two `load: true` builds with per-image gha cache scopes and `ignore-error=true`, then `scripts/ci/smoke-images.sh`. The script boots postgres, the API (non-root, healthy, `/ready`) and the web edge (`/healthz`, `/`, `/api/v1/sitemap.xml`), and runs an echo-upstream client-IP check." with:
    > `images`: needs quality, runs in parallel with test (it never pushes). Two `load: true` builds with per-image gha cache scopes and `ignore-error=true`, then `scripts/ci/compose-config-check.sh`, `scripts/ci/smoke-images.sh` (both containers healthy through their own `HEALTHCHECK`, `/health`, the `/ready` keys, the edge `/healthz`, `/`, `/health`, `/api/v1/sitemap.xml`, the client-IP echo check, and the root-owned/1000-owned bind-mount pair) and `scripts/ci/smoke-compose.sh` (the full production stack). On push events it saves both images as a 1-day artifact and outputs their IDs.
  - Replace "`publish`: push events only; needs every job; uses `docker/metadata-action` with `latest` only on the default branch, the full SHA, and the tag." with:
    > `publish`: push events only; `needs: [quality, test, images, doc-drift]`, no `always()`; loads the artifact, verifies the image IDs, and tags and pushes with `docker/metadata-action` tags (`latest` only on the default branch, the full SHA, the tag). It never builds (decision 16).
- Append decisions 10–16 from section 2 of this fragment after t4b decision 9.
- **Risks → t4b**:
  - Replace "[A root-owned `uploads` volume blocks the non-root API] → Mitigation: the fail-fast error names the directory and the `chown 1000:1000` fix, and new volumes inherit `node` ownership." with "[A root-owned uploads volume or host folder blocks the non-root API] → Mitigation: the fail-fast error names the directory, the UID and the fix, `make prod-fix-uploads-owner` applies it, and new named volumes inherit `node` ownership."
  - Replace "[The Coolify dashboard healthcheck needs curl/wget] → Mitigation: the guide says to disable it and rely on the image `HEALTHCHECK`. Verify the brewform.cc setting before rollout." with "[Coolify's HTTP health-check type needs curl/wget, which the API image lacks] → Mitigation: the guide configures the `CMD` type with `node /app/healthcheck.mjs /ready`. A disabled dashboard check falls back to the identical image `HEALTHCHECK`."
  - Append the six risks listed at the end of section 2.
- **Migration Plan → 3. Environment variables**: add the row "| `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE` | `uploads`, `postgres_data`, `backups` (named volumes) | t4b | Compose only; a value starting with `/`, `.` or `~` selects a host folder |". In "Behaviour changes to note", add "`/ready` returns fixed keys and `503` while shutting down."
- **Migration Plan → 4. Deploy order**:
  - Step 3: replace "Disable the dashboard healthcheck for the API (the image now has one), or confirm it is already off." with "Set the API dashboard Healthcheck to Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval 15, Timeout 5, Retries 3, Start period 180. Set the web Healthcheck to `HTTP` `GET` `/healthz` on port 80, expected 200, Interval 30, Timeout 3, Retries 3, Start period 10. Point uptime monitors at `https://api.brewform.cc/health` and `https://brewform.cc/healthz`. Redeploy both so the checks apply."
  - Step 4: replace "`chown 1000:1000` the uploads volume." with "Run `make prod-fix-uploads-owner` (or choose a host folder with `UPLOADS_SOURCE` and own it by `1000:1000`)."
- **Open Questions → Still open → t4b**: replace "Is the Coolify dashboard healthcheck enabled on the brewform.cc API resource? Confirm before rollout." with "Confirm that the brewform.cc Coolify version offers the `CMD` health-check type and application network aliases (fallbacks: a disabled dashboard check, and S3, which brewform.cc already uses)."

### 5.3 specs/node-runtime/spec.md (owner t8)

In "### Requirement: The Hono app boots on @hono/node-server behind an import guard", replace the paragraph starting "On `SIGTERM` or `SIGINT` the process SHALL close the HTTP server, …" with:
> On `SIGTERM` or `SIGINT` the process SHALL first mark itself as shutting down (so `GET /ready` returns `503`, as defined by the production-operations capability), then close the HTTP server, end the postgres-js client, close the email transporter and close the active cache provider (when it exposes `close`), log each step, and exit with code 0. A second signal received during shutdown SHALL be ignored.

Replace its "Graceful shutdown closes every resource" scenario with:
> #### Scenario: Graceful shutdown closes every resource
> - **WHEN** the running API receives `SIGTERM`
> - **THEN** readiness reports `shuttingDown: true` before the HTTP server closes, and the logs show the HTTP server, database connection, email transporter and cache connection closing, in that order
> - **AND** the process exits with code 0, and a second `SIGTERM` during shutdown does not run the sequence again

### 5.4 tasks.md (owners t2 and t8)

- **6.36 (t2)**: append "Group 19 later moves this route into `apps/api/src/modules/health/` (task 19.? 'Implement the health module'); keep the getters importable from `utils/cache` and `utils/rate-limit` so the move does not change them."
- **24.12 (t8, AGENTS.md)**: append "Health: `GET /health` is liveness and `GET /ready` is readiness (fixed keys, `503` while shutting down). Both images' `HEALTHCHECK`s and the compose api check run `node /app/healthcheck.mjs /ready`. The Coolify API check is the `CMD` type with that command and the web check is HTTP `/healthz`. Uptime monitors use `/health`. Compose data locations: `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE` (named volumes by default)."
- **25.19 (t8)**: append to the verified list: "exact Coolify health-check settings (CMD `node /app/healthcheck.mjs /ready`, web HTTP `/healthz`), Coolify Persistent Storage steps with the network alias and `API_UPSTREAM`, no production `pnpm`/drizzle-kit commands."
- **27.6 (t8)**: append "The `doc-drift` job runs on `push` and `pull_request` alike (no pull-request-only `if:`), because `publish` needs it."

### 5.5 specs/cache-driver and specs/api-rate-limiting (owner t2)

No change needed. `/ready`'s `cache`/`rateLimitStore` values and the DB-only status code
(`specs/cache-driver/spec.md:108-119`) and the `/health`/`/ready` exemption
(`specs/api-rate-limiting/spec.md:140,165-167`) match the production-operations probe requirement.

## 6. Remaining open questions (each with the default applied)

1. **Coolify HTTP versus CMD check for the API.** The task text asked for "path /ready, port 8000, method GET, expected 200". Coolify's HTTP type runs `curl`/`wget` inside the container, and the API image has neither. **Default:** the `CMD` type with `node /app/healthcheck.mjs /ready`, which probes the same `/ready` endpoint on port 8000 and expects 200. Fallback: a disabled dashboard check uses the identical image `HEALTHCHECK`. Adding curl to the image was rejected (t4b hardening).
2. **Image HEALTHCHECK path.** t4b chose `/health` for the image. **Default:** `/ready` everywhere (images, compose, Coolify), because Docker health only gates traffic and rollouts. `/health` stays for uptime monitors. Accepted cost: Traefik answers 404 during a DB outage longer than about 45 s.
3. **Valkey auth variable.** The task named `REDISCLI_AUTH`. **Default:** `VALKEYCLI_AUTH` (documented by Valkey; valkey-cli falls back to `REDISCLI_AUTH`).
4. **Backup target default.** t4b had the host folder `./backups`. **Default:** the named volume `backups`, as the task asks. `BACKUPS_SOURCE=./backups` gives the host folder, and `make prod-backup-export` serves off-host copies.
5. **Coolify network alias for local storage.** Needed because local photo URLs are root-relative. **Default:** alias `brewform-api` plus `API_UPSTREAM=brewform-api:8000`. Confirm the field on the brewform.cc Coolify version (brewform.cc uses S3 and is unaffected).
6. **Public `/ready` on the Coolify API domain.** **Default:** left reachable (it carries only component states, no secrets).
7. **Valkey data selector variable.** **Default:** none; the data is disposable.
8. **Readiness DB timeout configurability.** **Default:** the constant 2000 ms, with no env var.
9. **`/health` through the web edge.** **Default:** proxied (exact path), so compose uptime monitors reach the API through the single public origin. `/ready` is not proxied.
10. **No forced connection close on shutdown.** **Default:** rely on Node's `server.close()` (idle keep-alive connections close automatically), with the 30 s compose grace period. A forced `closeAllConnections()` timeout is not added.
