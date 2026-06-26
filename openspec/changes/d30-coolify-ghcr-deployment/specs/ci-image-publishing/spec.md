# CI Image Publishing

A GitHub Actions release workflow that builds and pushes `ghcr.io/ardakilic/brewform-api` and
`ghcr.io/ardakilic/brewform-web` to GHCR on every push to `main` and on version tags
(`v*`). Images are public (the repo is open-source). Coolify pulls the images with no
server-side `docker login` required. The existing `ci.yml` workflow (quality + tests) is
untouched and runs independently.

## ADDED Requirements

### Requirement: Release workflow builds and pushes both images

The system SHALL provide `.github/workflows/release.yml` that triggers on:
- `push` to the `main` branch
- `push` of tags matching `v*` (e.g., `v1.0.0`, `v1.2.3-beta`)

The workflow SHALL set `permissions: { contents: read, packages: write }` at the workflow level
so `GITHUB_TOKEN` can push to GHCR.

The workflow SHALL define two parallel jobs, `api` and `web`, each using:
- `actions/checkout@v7`
- `docker/setup-buildx-action@v3`
- `docker/login-action@v3` with `{ registry: ghcr.io, username: ${{ github.actor }}, password: ${{ secrets.GITHUB_TOKEN }} }`
- `docker/build-push-action@v7`

The `api` job SHALL build from `./Dockerfile` (context `.`) and tag:
- `ghcr.io/ardakilic/brewform-api:latest`
- `ghcr.io/ardakilic/brewform-api:${{ github.sha }}` (full commit SHA)
- `ghcr.io/ardakilic/brewform-api:${{ github.ref_name }}` — only on tag pushes (via the
  `startsWith(github.ref, 'refs/tags/v')` condition; on branch pushes this tag is empty and
  Docker ignores empty tags)

The `web` job SHALL build from `./Dockerfile.web` (context `.`) with build-args
`VITE_API_URL` and `VITE_PUBLIC_APP_URL` (sourced from GitHub repo secrets, with fallback
defaults — see the "Web image build-args" requirement below) and tag:
- `ghcr.io/ardakilic/brewform-web:latest`
- `ghcr.io/ardakilic/brewform-web:${{ github.sha }}`
- `ghcr.io/ardakilic/brewform-web:${{ github.ref_name }}` (only on tag pushes)

Both jobs SHALL use `cache-from: type=gha` and `cache-to: type=gha,mode=max` for GitHub Actions
layer caching (speeds up rebuilds by caching Docker layers between runs).

The existing `ci.yml` workflow SHALL remain unchanged and independent (it runs quality + tests
on PRs and on `main` pushes; `release.yml` only runs on `main` pushes and tags, not on PRs).

**Reference workflow** (the implementer should follow this shape — see `design.md` for the full
YAML):

```yaml
name: Release (Build & Push Images)
on:
  push:
    branches: [main]
    tags: ['v*']
permissions:
  contents: read
  packages: write
jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: |
            ghcr.io/ardakilic/brewform-api:latest
            ghcr.io/ardakilic/brewform-api:${{ github.sha }}
            ${{ startsWith(github.ref, 'refs/tags/v') && format('ghcr.io/ardakilic/brewform-api:{0}', github.ref_name) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile.web
          push: true
          build-args: |
            VITE_API_URL=${{ secrets.VITE_API_URL || '/api/v1' }}
            VITE_PUBLIC_APP_URL=${{ secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}
          tags: |
            ghcr.io/ardakilic/brewform-web:latest
            ghcr.io/ardakilic/brewform-web:${{ github.sha }}
            ${{ startsWith(github.ref, 'refs/tags/v') && format('ghcr.io/ardakilic/brewform-web:{0}', github.ref_name) || '' }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  deploy:
    runs-on: ubuntu-latest
    needs: [api, web]
    if: ${{ secrets.COOLIFY_API_WEBHOOK != '' }}
    steps:
      - name: Trigger Coolify deploy webhooks
        run: |
          curl --request GET '${{ secrets.COOLIFY_API_WEBHOOK }}' \
               --header 'Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}' || true
          curl --request GET '${{ secrets.COOLIFY_WEB_WEBHOOK }}' \
               --header 'Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}' || true
```

> Note: the canonical full workflow lives in `design.md §7`; this reference copy is illustrative —
> keep the two in sync (update `design.md §7` as the source of truth to avoid drift).

#### Scenario: Push to main publishes latest images

- **WHEN** a commit is pushed to the `main` branch
- **THEN** the `release.yml` workflow runs the `api` and `web` jobs in parallel
- **AND** `ghcr.io/ardakilic/brewform-api:latest` and `ghcr.io/ardakilic/brewform-api:<full-sha>`
  are pushed to GHCR
- **AND** `ghcr.io/ardakilic/brewform-web:latest` and `ghcr.io/ardakilic/brewform-web:<full-sha>`
  are pushed to GHCR
- **AND** no `:<git-tag>` tag is produced (this is not a tag push)

#### Scenario: Tag push publishes versioned images

- **WHEN** a tag `v1.2.0` is pushed
- **THEN** the `release.yml` workflow runs
- **AND** `ghcr.io/ardakilic/brewform-api:latest`, `ghcr.io/ardakilic/brewform-api:<full-sha>`,
  and `ghcr.io/ardakilic/brewform-api:v1.2.0` are pushed
- **AND** `ghcr.io/ardakilic/brewform-web:latest`, `ghcr.io/ardakilic/brewform-web:<full-sha>`,
  and `ghcr.io/ardakilic/brewform-web:v1.2.0` are pushed

#### Scenario: PR does not publish images

- **WHEN** a pull request is opened against `main`
- **THEN** `release.yml` does NOT run (it only triggers on `main` pushes and tags)
- **AND** only `ci.yml` runs (quality + tests)

#### Scenario: Layer caching speeds up rebuilds

- **WHEN** the `api` job runs for the second time (after a small code change)
- **THEN** Docker restores cached layers from the GitHub Actions cache (`type=gha`)
- **AND** only the changed layers and subsequent layers are rebuilt
- **AND** the build is faster than the first run

---

### Requirement: Web image build-args are injected from secrets with fallback defaults

The `web` job SHALL pass `VITE_API_URL` and `VITE_PUBLIC_APP_URL` as `build-args` to
`docker/build-push-action`. The values SHALL be sourced from GitHub repository secrets of the
same names (`secrets.VITE_API_URL` and `secrets.VITE_PUBLIC_APP_URL`) so the production API URL
is not hardcoded in the workflow file and can be rotated without a workflow edit.

If the secrets are not set (e.g., on a fresh fork without secrets configured), the build SHALL
fall back to safe defaults via the GitHub Actions expression `${{ secrets.VITE_API_URL || '/api/v1' }}`
and `${{ secrets.VITE_PUBLIC_APP_URL || 'http://localhost:8080' }}`, so the workflow does not fail
and produces a working (dev-configured) image.

The build-args are passed as a multi-line string to `docker/build-push-action`'s `build-args:`
input, which passes them as `--build-arg` to `docker build`. The `Dockerfile.web` builder stage
declares `ARG VITE_API_URL` and `ARG VITE_PUBLIC_APP_URL` and sets them as `ENV` so Vite's
`define` in `vite.config.ts` picks them up at build time.

#### Scenario: Web image build uses production API URL from secret

- **WHEN** the `web` job runs with `secrets.VITE_API_URL = 'https://api.brewform.example.com/api/v1'`
  and `secrets.VITE_PUBLIC_APP_URL = 'https://brewform.example.com'`
- **THEN** the built `dist/` has `https://api.brewform.example.com/api/v1` inlined as
  `import.meta.env.VITE_API_URL` in the JS bundle
- **AND** `index.html` has `https://brewform.example.com` in the og:image and twitter:image meta
  tags (via `%VITE_PUBLIC_APP_URL%` substitution)

#### Scenario: Web image build falls back to defaults without secrets

- **WHEN** the `web` job runs and `secrets.VITE_API_URL` is not set
- **THEN** the build uses `VITE_API_URL=/api/v1` (relative)
- **AND** the build uses `VITE_PUBLIC_APP_URL=http://localhost:8080`
- **AND** the build completes successfully (no failure)
- **AND** the resulting image is a dev-configured SPA (calls `/api/v1` relative, which only
  works if the API is on the same origin — useful for local testing, not for prod)

---

### Requirement: Images are public and pullable without authentication

The published GHCR images SHALL be public by default — the repository is public and
`GITHUB_TOKEN` is used for push. Any host (including the Coolify server) SHALL be able to
`docker pull ghcr.io/ardakilic/brewform-api:latest` without `docker login`.

**GHCR first-push behavior:** When a package is first pushed to GHCR via `GITHUB_TOKEN`, it
defaults to **private** visibility (this is GHCR's default for new packages, even on public
repos). The first published package MUST be manually set to public via the GitHub UI:
- GitHub → your profile → Packages → `brewform-api` → Package settings → Change visibility →
  Public
- Repeat for `brewform-web`

The `coolify_deployment_plan.md` SHALL document this one-time step in the "What's been done"
section.

After the visibility flip, all subsequent pushes to `:latest` and `:<tag>` are public, and
Coolify (or any host) can `docker pull` without authentication.

#### Scenario: Coolify pulls API image without login

- **WHEN** Coolify creates a Docker Image resource with image URL
  `ghcr.io/ardakilic/brewform-api:latest` (after the package is set to public)
- **THEN** `docker pull` succeeds without `docker login`
- **AND** the container starts

#### Scenario: First push requires manual visibility flip (documented)

- **WHEN** the first `release.yml` run pushes `ghcr.io/ardakilic/brewform-api:latest`
- **THEN** the package defaults to private visibility on GHCR
- **AND** an operator sets it to public via GitHub → Packages → brewform-api → Package settings
  → Change visibility → Public
- **AND** subsequent pulls from Coolify succeed without authentication

#### Scenario: Private package causes pull failure (before flip)

- **WHEN** Coolify tries to pull `ghcr.io/ardakilic/brewform-api:latest` before the visibility
  flip
- **THEN** the pull fails with an authentication error
- **AND** the operator either flips the package to public OR runs
  `docker login ghcr.io` on the Coolify server with a PAT (`read:packages` scope)

---

### Requirement: Optional Coolify deploy webhook trigger

The `release.yml` workflow MAY include a final `deploy` job that, when present, SHALL run only
after `api` and `web` succeed and send a `GET` request to the Coolify deploy webhook URLs if the
`COOLIFY_API_WEBHOOK` secret is set. This job SHALL be skipped (via
`if: ${{ secrets.COOLIFY_API_WEBHOOK != '' }}`) if the secret is absent, so the workflow does not
fail for users who haven't configured Coolify webhooks.

The `deploy` job SHALL `needs: [api, web]` (runs only after both image pushes succeed) and
shall send webhooks to both `COOLIFY_API_WEBHOOK` and `COOLIFY_WEB_WEBHOOK` (if set), each with
the `Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}` header. The `curl` commands SHALL
use `|| true` so a transient webhook failure does not fail the release (the images are already
pushed; the webhook is just a convenience to trigger an immediate redeploy).

The webhook call format:
```
curl --request GET '${{ secrets.COOLIFY_API_WEBHOOK }}' \
     --header 'Authorization: Bearer ${{ secrets.COOLIFY_API_TOKEN }}' || true
```

This triggers Coolify to re-pull the latest image and restart the container.

#### Scenario: Deploy webhook triggers Coolify redeploy

- **WHEN** `release.yml` completes the `api` and `web` jobs and `COOLIFY_API_WEBHOOK` is set
- **THEN** the `deploy` job sends a `GET` to the API webhook URL with the API token
- **AND** Coolify re-pulls `ghcr.io/ardakilic/brewform-api:latest` and restarts the API container
- **AND** (if `COOLIFY_WEB_WEBHOOK` is set) Coolify re-pulls `ghcr.io/ardakilic/brewform-web:latest`
  and restarts the web container

#### Scenario: Deploy webhook is skipped without secrets

- **WHEN** `release.yml` completes and `COOLIFY_API_WEBHOOK` is not set
- **THEN** the `deploy` job is skipped (via the `if:` condition)
- **AND** the workflow succeeds without error
- **AND** the images are already pushed (the `api` and `web` jobs succeeded)

#### Scenario: Deploy webhook failure does not fail the release

- **WHEN** the `deploy` job runs and a `curl` command fails (e.g., Coolify is unreachable)
- **THEN** the `|| true` prevents the step from failing
- **AND** the workflow succeeds (the images are already pushed)
- **AND** the operator can manually click "Redeploy" in Coolify

---

### Requirement: Required GitHub repository secrets for full automation

The following GitHub repository secrets SHALL be configured (repo → Settings → Secrets and
variables → Actions) to enable the full automation pipeline (build → push → trigger Coolify
redeploy with a production-configured web image):

| Secret | Required? | Purpose |
|--------|-----------|---------|
| `GITHUB_TOKEN` | Auto-provided | Used by `docker/login-action` to authenticate to GHCR. No manual setup needed. |
| `VITE_API_URL` | For prod web image | The production API URL baked into the web image (e.g., `https://api.brewform.example.com/api/v1`). If unset, falls back to `/api/v1` (dev). |
| `VITE_PUBLIC_APP_URL` | For prod web image | The production web URL baked into the web image (e.g., `https://brewform.example.com`). If unset, falls back to `http://localhost:8080` (dev). |
| `COOLIFY_API_WEBHOOK` | Optional | The Coolify API resource's deploy webhook URL. If set, triggers auto-redeploy of the API. |
| `COOLIFY_WEB_WEBHOOK` | Optional | The Coolify web resource's deploy webhook URL. If set, triggers auto-redeploy of the web. |
| `COOLIFY_API_TOKEN` | Optional (with webhooks) | The Coolify API token (Deploy scope) for authenticating webhook calls. |

The `coolify_deployment_plan.md` SHALL document how to obtain and set each secret (especially
the Coolify webhook URLs and token, which come from the Coolify panel).

#### Scenario: Fresh fork without secrets builds dev-configured images

- **WHEN** the workflow runs on a fresh fork with no secrets configured
- **THEN** `VITE_API_URL` falls back to `/api/v1` and `VITE_PUBLIC_APP_URL` to
  `http://localhost:8080`
- **AND** the web image is built with dev defaults (works for local testing, not for prod)
- **AND** the `deploy` job is skipped (no `COOLIFY_*` secrets)
- **AND** the `api` and `web` images are pushed to the fork's GHCR namespace

#### Scenario: Full automation with all secrets

- **WHEN** all secrets are configured (`VITE_API_URL`, `VITE_PUBLIC_APP_URL`,
  `COOLIFY_API_WEBHOOK`, `COOLIFY_WEB_WEBHOOK`, `COOLIFY_API_TOKEN`)
- **THEN** the web image is built with the production API URL
- **AND** after push, the `deploy` job triggers Coolify to redeploy both resources
- **AND** the deployment is fully automated: push to `main` → images built → images pushed →
  Coolify redeploys