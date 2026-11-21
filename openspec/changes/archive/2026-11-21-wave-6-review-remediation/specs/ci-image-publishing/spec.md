## MODIFIED Requirements

### Requirement: Pull requests build and smoke-test both images without publishing
Every pull-request run of the CI workflow SHALL build both `Dockerfile` and `Dockerfile.web` with pushing disabled (`load: true`, no registry login) and SHALL boot the two images, first standalone against a disposable Postgres and then as the full `compose.production.yml` stack, to verify that both images become healthy through their own `HEALTHCHECK`, that the health and readiness endpoints answer, that the web edge serves the SPA and proxies the API, that local uploads persist, and that a backup can be restored.

The `images` job (`needs: quality`) SHALL run the same builds and smoke tests on `main` and tag
pushes before `publish`. It may run at the same time as `test` because it never pushes. Its steps,
each a script in the repository that also runs locally:

1. `scripts/ci/dockerignore.test.sh`: builds a `FROM scratch` image from a temporary context that
   holds the repository's `.dockerignore`, an unreadable `data/postgres` folder, backup files and
   env files, and asserts that the build succeeds, that the data folders, `*.dump`,
   `uploads-*.tar.gz` and env files are absent and that the three `*.env.example` templates and
   `files/` are present.
2. `scripts/ci/compose-config-check.sh`: renders `compose.production.yml` with
   `docker compose config --format json` from the placeholder env file
   `scripts/ci/compose-smoke.env` and asserts with `jq` that every long-running service (`postgres`,
   `valkey`, `api`, `web`, `backup`) has a health check, that the dependency conditions match the
   production-operations capability, that the api `UPLOAD_DIR` is `/app/uploads`, that the uploads
   mount is a `volume` named `uploads` by default and a `bind` when `UPLOADS_SOURCE=./ci-data/uploads`,
   and that no health-check test or command contains the placeholder passwords.
3. `scripts/ci/smoke-images.sh` (standalone containers on a throwaway network):
   - start `postgres:18-trixie`, then the API image in default `serve` mode (migrations and the
     first-install seed run) with a named volume at `/app/uploads`, and wait up to 180 seconds for
     the container's own health status to become `healthy` (no health-check override)
   - assert `id -u` is `1000`, `GET /health` returns `200` with `{"status":"ok"}`, and `GET /ready`
     returns `200` with exactly the readiness keys defined by the production-operations capability
     and `status: "ready"`
   - start the web image with `API_UPSTREAM` pointing at the API container, wait for it to become
     `healthy`, and assert that `GET /healthz` returns `200`, `GET /` returns the SPA `index.html`,
     `GET /health` returns the API's liveness JSON through the edge, `GET /sitemap.xml` returns the
     API's XML sitemap index through the edge, and `GET /api/v1/sitemap.xml` answers `301` to it
   - run the client-IP echo checks and `scripts/ci/web-entrypoint.test.sh`
   - start the API image with `RUN_MIGRATIONS=false` and `/app/uploads` bind-mounted from a
     root-owned `0755` temporary directory, and assert it exits with status `1` and logs
     `is not writable by uid 1000 gid 1000`; repeat with the directory owned by `1000:1000` and
     assert the container becomes `healthy`
4. `scripts/ci/smoke-compose.sh` (the production stack with the just-built images, project name
   `brewform-ci`):
   - `docker compose up -d` and poll until `postgres`, `valkey`, `api`, `web` and `backup` report
     `healthy` and `migrate` has exited with status `0`, failing after 300 seconds; assert the
     production seed created exactly one user (the admin) and no `@example.com` account
   - assert through the published web port that `/healthz` and `/health` return `200`, and inside
     the api container that `node /app/healthcheck.mjs /ready` exits `0`
   - write a small PNG into `/app/uploads` as the `node` user, recreate the api with
     `docker compose up -d --force-recreate api`, wait for `healthy`, and assert `GET /uploads/<file>`
     through the web edge returns it
   - while a file in the uploads source keeps growing, run a one-shot backup and assert it exits `0`
     and logs that the uploads changed while archiving; assert `/backups` holds a `db-*.dump` that
     `pg_restore --list` accepts and an `uploads-*.tar.gz` listing the PNG
   - add a table with foreign keys to `user` and `recipe` and a user row, delete the PNG, run
     `make prod-restore` with the dump and archive (env file and project overridden), and assert the
     stack becomes healthy, the table and the row are gone, the PNG is served again, the migration
     count equals the journal, and a safety dump containing the added table exists
   - migrate a scratch database with the newest journal entry removed, dump it with the backup
     service, restore it with `make prod-restore`, and assert `migrate` applied the missing migration
     (migration count equals the journal) and the api becomes healthy
   - stop the api with `docker compose stop api` and assert exit status `0` and the log line
     `Graceful shutdown complete`
   - always tear down with `docker compose down -v`

Every script SHALL print the logs of all containers it started and fail the job when any assertion
fails, and SHALL clean up with a `trap`.

#### Scenario: Broken Dockerfile fails the pull request
- **WHEN** a pull request introduces a change that makes `docker build -f Dockerfile` fail
- **THEN** the image-build job fails and the pull request shows a failing check

#### Scenario: Entrypoint crash fails the pull request
- **WHEN** a pull request makes the API container exit during migrations or startup
- **THEN** the container never becomes `healthy` within the timeout
- **AND** the job prints the API container logs and fails

#### Scenario: Broken health check fails the pull request
- **WHEN** a pull request changes `/ready` to return `503` for a ready instance, or removes the `HEALTHCHECK` from either Dockerfile
- **THEN** the standalone smoke test fails because the container never reports `healthy`

#### Scenario: Missing compose health check fails the pull request
- **WHEN** a pull request removes the `healthcheck` of any long-running service in `compose.production.yml`
- **THEN** `scripts/ci/compose-config-check.sh` fails naming that service

#### Scenario: Lost uploads fail the pull request
- **WHEN** a pull request changes the api uploads mount or `UPLOAD_DIR` so files no longer land on the uploads source
- **THEN** the compose smoke test's recreate-and-fetch assertion fails

#### Scenario: Broken restore fails the pull request
- **WHEN** a pull request makes the `restore` service or `make prod-restore` leave a mixed database, skip the safety backup, or stop `migrate` from upgrading an older dump
- **THEN** a restore assertion of the compose smoke test fails

#### Scenario: Build-context regression fails the pull request
- **WHEN** a pull request removes a data-folder exclusion from `.dockerignore` or adds a `**/` exception
- **THEN** `scripts/ci/dockerignore.test.sh` fails

#### Scenario: Edge proxy regression fails the pull request
- **WHEN** a pull request breaks the web edge's `/api/*` reverse proxy
- **THEN** the proxied `/api/v1/...` assertion fails and the job fails

#### Scenario: Fork pull requests can run the image job
- **WHEN** a pull request from a fork runs CI
- **THEN** the images are built and smoke-tested without secrets, registry login or push
