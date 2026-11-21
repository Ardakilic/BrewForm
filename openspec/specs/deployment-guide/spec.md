# deployment-guide Specification

## Purpose

Keeps the self-hosted deployment guides (`docs/deployment_compose.md` and
`docs/deployment_coolify.md`) consistent with the shipped images and tooling. The guides state the
pinned Node and pnpm versions, the frozen install, the Caddy pin, how the API image applies
migrations, the plain Node start command with in-process jobs, and Coolify's exact health-check and
persistent upload settings. No guide tells an operator to run pnpm or drizzle-kit inside a
production container.
## Requirements
### Requirement: Guide pins drizzle-kit consistently with the codebase
The self-hosted deployment guides (`docs/deployment_compose.md` and `docs/deployment_coolify.md`) SHALL describe production migrations only as the API image applies them — the `migrate` entrypoint mode run by the compose `migrate` service (`make prod-up`, or `docker compose --env-file .env.production -f compose.production.yml run --rm migrate`), or `serve` mode on every container start in Coolify, both running the `@brewform/db` migration runner (`packages/db/src/migrate.ts`) with `node` — and SHALL mention drizzle-kit only for generating migrations in development, through the `@brewform/db` workspace scripts (`pnpm --filter @brewform/db run generate` or the root `pnpm run db:generate`) that resolve the single catalog pin in the `pnpm-workspace.yaml` `catalog:`, without stating a drizzle-kit version literal.

The runtime image contains neither pnpm nor drizzle-kit (container-deployment capability), so no
guide SHALL tell an operator to run either inside a production container.

#### Scenario: Operator commands match image behaviour
- **WHEN** an operator copies a production migration command from either guide
- **THEN** it is `make prod-up`, `docker compose --env-file .env.production -f compose.production.yml run --rm migrate`, or a Coolify redeploy
- **AND** it runs the same migration runner the image's entrypoint runs

#### Scenario: No drizzle-kit version literal or runtime invocation
- **WHEN** both guides are searched for `drizzle-kit@` and for `exec` commands that run `pnpm` or `drizzle-kit` in a production container
- **THEN** nothing matches

### Requirement: Guide reflects that shipped codebase prerequisites are implemented
A codebase-prerequisites table in any deployment guide SHALL NOT mark prerequisites that have already shipped as "Not yet implemented": the deployment infrastructure (both Dockerfiles, `docker-entrypoint.sh`, `docker-web-entrypoint.sh`, `compose.production.yml`, the CI-gated image `publish` job in `ci.yml`, the split `.env.example` files) and the Node 26 / pnpm runtime migration (#135) have shipped on `main`, so their rows SHALL show a done status, and rows for removed mechanisms (for example the webhook deploy job and the separate `release.yml` workflow) SHALL be deleted rather than left as pending.

#### Scenario: Shipped prerequisites are not flagged as pending
- **WHEN** an operator reads the codebase-prerequisites table
- **THEN** every shipped row shows a done status
- **AND** none reads "Not yet implemented" and no row describes a pipeline step that no longer exists

### Requirement: Guide aligns the Caddy image pin

The deployment guide SHALL reference the web image's Caddy base as `caddy:2.11.9-alpine`, matching
`Dockerfile.web` and the pinned compose preview service, rather than a floating `caddy:2-alpine`
tag.

#### Scenario: Caddy reference matches the pinned base

- **WHEN** an operator reads the §2 web-Dockerfile prerequisite row
- **THEN** it references `caddy:2.11.9-alpine`
- **AND** it does not reference a floating `caddy:2-alpine` tag

### Requirement: Guide reflects the pinned Node runtime and pnpm version
The self-hosted deployment guides SHALL state that the runtime is Node 26 LTS and that pnpm is pinned exactly, and SHALL point to the authoritative pins — `.nvmrc`, the root `package.json` `engines` / `devEngines` / `packageManager` fields, and the `FROM node:<version>-trixie-slim` lines of `Dockerfile` and `Dockerfile.web` — instead of restating patch versions that Renovate bumps; its prerequisites / pre-flight section SHALL surface this so an operator rebuilding an image knows the expected runtime.

#### Scenario: Runtime is discoverable in the guide
- **WHEN** an operator reads the prerequisites / pre-flight section
- **THEN** it names Node 26 LTS and pnpm and links or names the files that hold the exact pins
- **AND** it does not mention any other JavaScript runtime as current

### Requirement: Guide reflects the frozen pnpm install and the workspace layout
The self-hosted deployment guides SHALL describe dependency installation in the Docker `deps` stages as `pnpm fetch` followed by `pnpm install --frozen-lockfile --offline`, and in CI as `pnpm install --frozen-lockfile`, wherever they cover building or rebuilding images; where they describe the production migrate and seed steps they SHALL state that `docker-entrypoint.sh` runs the `@brewform/db` migration runner, user-count check and seed directly with `node` (the runtime image has no pnpm), and where they describe development or CI database steps they SHALL use the pnpm workspace scripts (`pnpm --filter @brewform/db run migrate` / `run seed`, or the root `db:*` scripts) inside the workspace defined by `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`).

#### Scenario: Build instructions reference the frozen install
- **WHEN** an operator reads the image build, rebuild or maintenance instructions
- **THEN** they describe installs as frozen pnpm installs, consistent with the Dockerfiles and CI

#### Scenario: Production migrate and seed steps match the entrypoint
- **WHEN** an operator reads the first-deploy migrate and seed steps
- **THEN** the guide explains that the image runs `node /app/packages/db/src/migrate.ts`, then the user-count check, then the seed on an empty database, and shows the entrypoint log lines to expect
- **AND** it does not show a `pnpm` command for a production container

#### Scenario: Development steps use the workspace scripts
- **WHEN** a contributor reads a guide's local or CI database steps
- **THEN** the guide shows the `@brewform/db` filtered commands and explains that they run within the pnpm workspace

### Requirement: Guide documents the plain Node start command and in-process jobs
The self-hosted deployment guides SHALL document the API start command exactly as `docker-entrypoint.sh` runs it (a direct Node invocation of `src/main.ts` after migrations and the first-boot seed check, as defined by the container-deployment capability) with no runtime permission or unstable-feature flags, and SHALL note that scheduled jobs (hourly badge evaluation via `node-cron`) run inside every API replica.

#### Scenario: Start command matches the entrypoint
- **WHEN** a reader compares a guide's start command with the `exec` line of `docker-entrypoint.sh`
- **THEN** they are identical and carry no runtime flags

#### Scenario: Replica note is present
- **WHEN** a reader looks for scaling guidance
- **THEN** the guide states that in-process jobs fire once per replica

### Requirement: Coolify guide gives exact health-check settings
`docs/deployment_coolify.md` SHALL give the exact dashboard **Healthcheck** values for both resources and the uptime-monitor URLs, so an operator can copy them without reading code:

| Field | API resource (Docker Image) | Web resource (Docker Image) |
|---|---|---|
| Enabled | yes | yes |
| Type | `CMD` | `HTTP` |
| Command | `node /app/healthcheck.mjs /ready` | (none) |
| Method / Scheme / Host | (none) | `GET` / `http` / `localhost` |
| Port | (none; the script reads `APP_PORT`, default `8000`) | `80` |
| Path | (none; `/ready` is the command argument) | `/healthz` |
| Expected status code | (exit code `0`) | `200` |
| Interval | `15` s | `30` s |
| Timeout | `5` s | `3` s |
| Retries | `3` | `3` |
| Start period | `180` s | `10` s |

The guide SHALL explain why the API uses the `CMD` type: Coolify runs dashboard checks inside the
container, its `HTTP` type needs `curl` or `wget`, and the API image ships neither, while the `CMD`
type runs the same probe as the image `HEALTHCHECK` (a single command with no shell operators, as
Coolify requires). It SHALL state that the check targets readiness (`/ready`, which needs the
database), that Coolify waits for it during rolling updates and Traefik stops routing to a container
that fails it, and that disabling the dashboard check falls back to the image's identical built-in
`HEALTHCHECK`. It SHALL state that a change to these fields takes effect only after a redeploy.

Uptime monitors SHALL use liveness: `https://<api domain>/health` (expect `200` and the text
`"status":"ok"`) in the split-domain setup, `https://<web domain>/health` when the web edge proxies
the API, and `https://<web domain>/healthz` for the web container. The guide SHALL tell operators
not to point uptime monitors at `/ready`.

#### Scenario: API health check settings are copyable
- **WHEN** an operator follows the API resource steps in `docs/deployment_coolify.md`
- **THEN** the guide lists Type `CMD`, Command `node /app/healthcheck.mjs /ready`, Interval 15, Timeout 5, Retries 3 and Start period 180
- **AND** after a redeploy Coolify shows the API container as healthy

#### Scenario: Web health check settings are copyable
- **WHEN** an operator follows the web resource steps
- **THEN** the guide lists Type `HTTP`, Method `GET`, Port `80`, Path `/healthz`, expected code `200`, Interval 30, Timeout 3, Retries 3 and Start period 10

#### Scenario: Monitoring paths are distinguished
- **WHEN** an operator reads the monitoring section
- **THEN** the guide names `/health` and `/healthz` for uptime monitors and `/ready` only for the orchestrator health check

### Requirement: Coolify guide documents persistent local upload storage
`docs/deployment_coolify.md` SHALL document how to run the API with `STORAGE_DRIVER=local` without losing photos on redeploy, by adding Coolify **Persistent Storage** at `/app/uploads`, and SHALL make the web resource serve those photos through the same-origin edge.

- Volume (default): API resource → Configuration → Persistent Storage → Add → **Volume Mount**,
  Name `brewform-uploads`, Destination Path `/app/uploads`. A new empty volume inherits the image's
  `node` ownership, so no `chown` is needed.
- Host folder (alternative): Add → **Directory Mount**, Source Path an absolute server path (for
  example `/data/brewform/uploads`), Destination Path `/app/uploads`; then on the server run
  `sudo chown -R 1000:1000 /data/brewform/uploads` before redeploying, because the API runs as UID
  `1000` and fails fast on an unwritable directory.
- Photo URLs from local storage are root-relative (`/uploads/<file>`), so the browser requests them
  from the web domain. The guide SHALL therefore require, with local storage, a network alias on the
  API resource (for example `brewform-api`, in the API resource's network alias setting) and
  `API_UPSTREAM=brewform-api:8000` on the web resource, so the web edge proxies `/uploads/*`,
  `/share/*`, `/api/*` and `/health` to the API. Both resources MUST be on the same Coolify
  destination network. An alias is used because container names change on every rolling deploy.
- The guide SHALL state that both containers mount the same volume during a rolling update, which
  is safe because upload keys are unique, write-once file names; that Coolify can schedule backups
  of the volume or directory but a copy SHALL also be kept off the server; and that `STORAGE_DRIVER=s3`
  stays the recommended production setting.
- Migration for a Coolify install that used local storage before this change: before redeploying,
  copy the files out of the running container with
  `docker cp <api container>:/app/apps/api/uploads ./uploads-rescue` on the server; after
  redeploying with persistent storage, copy them in with
  `docker cp ./uploads-rescue/. <new api container>:/app/uploads/` and run
  `docker exec -u 0 <new api container> chown -R 1000:1000 /app/uploads`.

#### Scenario: Photos survive a Coolify redeploy with a volume
- **WHEN** the API resource has the `brewform-uploads` volume at `/app/uploads`, `STORAGE_DRIVER=local`, the web resource has `API_UPSTREAM` set to the API alias, and a photo is uploaded before a redeploy
- **THEN** after the redeploy the photo loads from `https://<web domain>/uploads/<file>`

#### Scenario: Directory mount needs the documented ownership
- **WHEN** an operator follows the Directory Mount steps including the `chown -R 1000:1000` command
- **THEN** the redeployed API starts healthy and accepts uploads

#### Scenario: Missing persistent storage is visible
- **WHEN** the API runs on Coolify with `STORAGE_DRIVER=local` and no Persistent Storage at `/app/uploads`
- **THEN** the guide's troubleshooting table explains the startup warn log and `storage: "ephemeral"` in `/ready`, and gives the Persistent Storage fix

### Requirement: Deployment guides keep secrets off command lines
The deployment guides SHALL NOT show a command that puts a password, connection string with a password, or secret key into a process argument or a literal shell assignment; secrets SHALL be passed through the environment (`-e VAR` with no value, `--env-file`), read with `read -rs`, or avoided by running the command inside the database container over its local socket.

#### Scenario: Coolify identifier check passes DATABASE_URL through the environment
- **WHEN** an operator runs the identifier check from `docs/deployment_coolify.md`
- **THEN** the command uses `-e DATABASE_URL` without a value after `read -rs DATABASE_URL`, so the value appears in neither `ps` nor the shell history

#### Scenario: Photo-row audit needs no connection string
- **WHEN** an operator runs the photo-row query of the Coolify photo storage security check
- **THEN** it runs with `docker exec` inside the postgres container without a password argument

