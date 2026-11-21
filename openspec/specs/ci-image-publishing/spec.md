# ci-image-publishing Specification

## Purpose

Defines the single CI workflow (`.github/workflows/ci.yml`) that checks pull requests and `main` and
publishes the API and web images to GHCR. Pull requests build and smoke-test both images without
publishing; on `main`, images are published only after every CI job succeeds, with least-privilege
permissions and superseded runs cancelled. It also covers the web build arguments taken from
repository secrets with fallback defaults, and anonymous pull access to the published images.
## Requirements
### Requirement: Web image build-args are injected from secrets with fallback defaults
On `push` events the CI `images` job SHALL pass `VITE_API_URL` and `VITE_PUBLIC_APP_URL` as build args when it builds `Dockerfile.web`, sourced from the repository secrets of the same names with the fallbacks `/api/v1` and `http://localhost:8080`, so a run without secrets still succeeds; the `publish` job SHALL NOT build images at all.

The values come from
`${{ github.event_name == 'push' && secrets.VITE_API_URL || '/api/v1' }}` and
`${{ github.event_name == 'push' && secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}`
and are passed through `docker/build-push-action`'s `build-args:` input. `Dockerfile.web` declares
both as `ARG` and promotes them to `ENV` so Vite's `define` inlines them. Because the web image that
is smoke-tested is the image that is published (see "Images are published only after CI
succeeds"), the baked values are fixed in the `images` job.

Pull-request image builds SHALL use the fallback values (no secrets are available to fork PRs, and
PR images are never published).

Both values are only defaults baked into the bundle. At runtime the web container can override the
API URL through `VITE_API_URL` (written to `/config.js`) and the public origin through
`PUBLIC_APP_URL` (rewritten into `index.html` and `robots.txt`). The `/api/v1` fallback is a valid
production value for same-origin deployments that use the web edge proxy.

#### Scenario: Published web image uses the production URLs from secrets
- **WHEN** a `push` run builds and publishes the web image with `secrets.VITE_API_URL = 'https://api.brewform.example.com/api/v1'` and `secrets.VITE_PUBLIC_APP_URL = 'https://brewform.example.com'`
- **THEN** the bundle inlines `https://api.brewform.example.com/api/v1` as `import.meta.env.VITE_API_URL`
- **AND** `index.html` uses `https://brewform.example.com` in its `og:image` and `twitter:image` tags

#### Scenario: Build falls back to defaults without secrets
- **WHEN** the web image is built and `secrets.VITE_API_URL` and `secrets.VITE_PUBLIC_APP_URL` are not set
- **THEN** the build uses `VITE_API_URL=/api/v1` and `VITE_PUBLIC_APP_URL=http://localhost:8080`
- **AND** the build completes successfully

#### Scenario: Pull-request builds never read secrets
- **WHEN** the image build runs for a pull request, including one from a fork
- **THEN** the web image is built with the fallback values and the job does not reference `secrets.VITE_*`

### Requirement: Images are public and pullable without authentication
The published GHCR images SHALL be public so that any host, including a Coolify server, can `docker pull ghcr.io/ardakilic/brewform-api` and `ghcr.io/ardakilic/brewform-web` without `docker login`.

When a package is first pushed to GHCR with `GITHUB_TOKEN` it defaults to private visibility, even
for a public repository. The first published package MUST be set to public once via GitHub →
Packages → `brewform-api` (and `brewform-web`) → Package settings → Change visibility → Public. The
deployment guide SHALL document this one-time step. After the change, every later push stays
public.

#### Scenario: Coolify pulls the API image without login
- **WHEN** Coolify creates a Docker Image resource for `ghcr.io/ardakilic/brewform-api:latest` after the package was made public
- **THEN** `docker pull` succeeds without `docker login`
- **AND** the container starts

#### Scenario: First push requires a manual visibility change (documented)
- **WHEN** the first `publish` job run pushes `ghcr.io/ardakilic/brewform-api:latest`
- **THEN** the package is private on GHCR
- **AND** an operator makes it public via the package settings, after which anonymous pulls succeed

#### Scenario: Private package causes a pull failure before the change
- **WHEN** a host tries to pull the image before the visibility change
- **THEN** the pull fails with an authentication error
- **AND** the operator either makes the package public or runs `docker login ghcr.io` with a token that has the `read:packages` scope

### Requirement: Required GitHub repository secrets for full automation
The repository SHALL need no secrets other than the automatically provided `GITHUB_TOKEN` to build, test and publish images, and SHALL treat `VITE_API_URL` and `VITE_PUBLIC_APP_URL` as optional secrets that only change the defaults baked into the published web image.

| Secret | Required? | Purpose |
|--------|-----------|---------|
| `GITHUB_TOKEN` | Auto-provided | Authenticates `docker/login-action` to GHCR in the `publish` job (`packages: write`) |
| `VITE_API_URL` | Optional | API URL baked into the published web image by the `images` job on `push` events (for example `https://api.brewform.example.com/api/v1`); falls back to `/api/v1` |
| `VITE_PUBLIC_APP_URL` | Optional | Public web origin baked into `index.html` and `robots.txt` by the `images` job on `push` events; falls back to `http://localhost:8080` |

No Coolify webhook or token secrets are used: the webhook deploy job was removed, and redeploys are
triggered from Coolify (see the deployment guide). The deployment guide SHALL document how to set
the optional secrets and that runtime `VITE_API_URL` / `PUBLIC_APP_URL` on the web container
override them.

#### Scenario: Fresh fork without secrets builds and tests images
- **WHEN** CI runs on a fork with no secrets configured
- **THEN** the quality, test and image-build jobs pass
- **AND** the web image uses `/api/v1` and `http://localhost:8080`

#### Scenario: Optional secrets change only the baked defaults
- **WHEN** `VITE_API_URL` and `VITE_PUBLIC_APP_URL` are configured
- **THEN** the published web image bakes those values
- **AND** a web container started with runtime `VITE_API_URL` and `PUBLIC_APP_URL` still uses the runtime values

### Requirement: Images are published only after CI succeeds
Container images SHALL be pushed to GHCR only by a `publish` job in `.github/workflows/ci.yml` that runs for `push` events on `main` or on `v*` tags, declares `needs:` on every other job of the workflow (`quality`, `test`, `images` and `doc-drift`), and pushes the exact images the `images` job built and smoke-tested in the same run, so publication never runs in parallel with, or ahead of, any check and any failing, skipped or cancelled check prevents publication of that commit.

- Ordering: `publish` starts only after every job it needs has finished with `success`. Its `if:`
  condition SHALL be `github.event_name == 'push'` and SHALL NOT contain `always()`, `failure()` or
  `cancelled()`, so GitHub's implicit `success()` gate applies. Adding a job to `ci.yml` SHALL
  include adding it to `publish.needs`, and every job in `publish.needs` SHALL also run on `push`
  events (no pull-request-only `if:`), because a skipped need skips `publish`.
- Completeness guard: a step in the `quality` job SHALL run `scripts/ci/check-publish-needs.sh`,
  which uses `yq` (preinstalled on GitHub-hosted Ubuntu runners) to compare `.jobs.publish.needs`
  with every job id in `.github/workflows/ci.yml` except `publish` itself and jobs whose `if:` is
  exactly `github.event_name == 'pull_request'`, and exits 1 listing every missing job id.
- Image handoff: on `push` events the `images` job SHALL save both smoke-tested images with
  `docker save` into one workflow artifact (retention 1 day) and expose each image ID
  (`docker image inspect --format '{{.Id}}'`) as a job output. `publish` SHALL download the
  artifact, `docker load` it, fail if either loaded image ID differs from the recorded output, then
  `docker tag` and `docker push` every tag. It SHALL NOT run `docker build` or
  `docker/build-push-action`, so a cache miss can never publish an image that was not smoke-tested.
  Pull-request runs SHALL NOT upload the artifact.
- Image names SHALL be `ghcr.io/<repository owner, lowercased>/brewform-api` and
  `.../brewform-web`, so forks publish to their own namespace.
- Tags (generated with `docker/metadata-action` in `publish`; OCI labels generated by the same
  action in `images` and applied at build time):
  - `main` push: `latest` and the full commit SHA (no prefix), matching the existing rollback tags
  - `v*` tag push: the tag name (for example `v1.2.0`) and the full commit SHA; `latest` is NOT
    moved by tag pushes, so tagging an older commit cannot roll `latest` back
- The `images` job SHALL use the GitHub Actions cache with a separate scope per image (`api`,
  `web`) so the two images do not evict each other's cache.
- No other workflow and no `Makefile` target SHALL push to the production image names, and no
  workflow other than `ci.yml` SHALL hold `packages: write`.

#### Scenario: Green main push publishes latest
- **WHEN** a commit is pushed to `main` and the `quality`, `test`, `images` and `doc-drift` jobs succeed
- **THEN** the `publish` job pushes `brewform-api` and `brewform-web` tagged `latest` and `<full-sha>`

#### Scenario: Publishing never overlaps the tests
- **WHEN** the job timeline of a `main` run is inspected
- **THEN** the `publish` job's start time is later than the completion time of every `test`, `images`, `quality` and `doc-drift` job of that run

#### Scenario: Failing tests block publication
- **WHEN** a commit is pushed to `main` and any test job fails
- **THEN** the `publish` job is skipped
- **AND** `latest` on GHCR still points to the previous successful commit

#### Scenario: Doc-drift failure blocks publication
- **WHEN** a commit is pushed to `main` and the `doc-drift` job fails
- **THEN** the `publish` job is skipped

#### Scenario: Publication waits for the slowest check
- **WHEN** the `images` job of a `main` run finishes before the `test` job
- **THEN** `publish` does not start until the `test` job has succeeded

#### Scenario: A new job missing from publish.needs fails CI
- **WHEN** a contributor adds a job to `ci.yml` that runs on `push` without adding it to `publish.needs`
- **THEN** the `quality` job fails and `scripts/ci/check-publish-needs.sh` names the missing job

#### Scenario: Cancelled or skipped checks block publication
- **WHEN** the `test` job of a `main` run is cancelled or skipped
- **THEN** the `publish` job does not run

#### Scenario: The published image is the smoke-tested image
- **WHEN** a `main` run publishes
- **THEN** the image IDs pushed for `brewform-api` and `brewform-web` equal the IDs the `images` job recorded after its smoke tests
- **AND** the `publish` job log contains no image build step

#### Scenario: Version tag publishes a versioned image without moving latest
- **WHEN** the tag `v1.2.0` is pushed and CI succeeds for that commit
- **THEN** the images are pushed tagged `v1.2.0` and `<full-sha>`
- **AND** the `latest` tag is not changed by this run

#### Scenario: Pull requests never publish
- **WHEN** CI runs for a pull request
- **THEN** the `publish` job does not run and no registry login happens

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

### Requirement: One CI workflow covers pull requests and main
The repository SHALL run all pull-request, `main` and tag checks and the image publication from the single `.github/workflows/ci.yml` workflow, and neither `.github/workflows/pr.yml` nor `.github/workflows/release.yml` SHALL exist.

`ci.yml` SHALL check, at minimum: formatting (`pnpm run fmt-check`), lint (`pnpm run lint`), types
(`pnpm run check`), migration freshness (`pnpm run db:generate` followed by `git diff --exit-code`),
the email template build, the production build, the API, shared, db and web test suites with
coverage (keeping the single coverage comment on pull requests), the image builds and smoke tests
(`images`) and the doc-drift guard (`doc-drift`). The workflow file name stays `ci.yml` because the
coverage-baseline download steps reference it.

#### Scenario: Each pull request triggers one CI workflow
- **WHEN** a pull request is opened or updated
- **THEN** exactly one workflow run (`CI`) is started for that commit
- **AND** no `PR Checks` run is started

#### Scenario: A main push starts no second image workflow
- **WHEN** a commit is pushed to `main`
- **THEN** exactly one workflow run (`CI`) is started for that commit and no `Release` run exists

#### Scenario: Uncommitted migration drift fails CI
- **WHEN** a pull request changes `packages/db/src/schema.ts` without committing the generated migration
- **THEN** the migration-freshness step fails

#### Scenario: All four test suites run once
- **WHEN** CI runs for a pull request
- **THEN** the API, shared, db and web suites each run exactly once
- **AND** the coverage comment on the pull request is created or updated once

### Requirement: CI workflow uses least privilege and cancels superseded runs
`.github/workflows/ci.yml` SHALL declare top-level `permissions: contents: read`, grant broader scopes only to the jobs that need them, use a concurrency group that cancels superseded pull-request runs but never cancels `main` or tag runs, and pin every action outside the `actions/` and `docker/` organizations to a full commit SHA.

- The coverage-reporting job is the only job with `pull-requests: write` (and `actions: read` for
  the baseline download); the `publish` job is the only job with `packages: write`.
- The concurrency group is keyed on the pull request number for PRs and on the ref otherwise, with
  `cancel-in-progress` true only for `pull_request` events.
- SHA-pinned actions carry a trailing comment with the human-readable version so Renovate can update
  them.
- Long-running jobs declare `timeout-minutes`.

#### Scenario: New push cancels the stale pull-request run
- **WHEN** a second commit is pushed to a pull request while the first commit's CI run is still in progress
- **THEN** the first run is cancelled and the second continues

#### Scenario: Main runs are never cancelled
- **WHEN** two commits land on `main` in quick succession
- **THEN** the first run completes (including `publish`) and the second run waits for it in the same concurrency group

#### Scenario: Write scopes are confined
- **WHEN** the workflow file is inspected
- **THEN** the top-level permissions are `contents: read`
- **AND** only the coverage job has `pull-requests: write` and only the `publish` job has `packages: write`

#### Scenario: Third-party actions are SHA-pinned
- **WHEN** the workflow file is inspected
- **THEN** `dawidd6/action-download-artifact` and `pnpm/action-setup` are referenced by a 40-character commit SHA with a version comment

