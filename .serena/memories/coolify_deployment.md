# Coolify Production Deployment

BrewForm runs in production on a self-hosted **Coolify v4.1.x** instance, fronted by
Cloudflare. Full guides: `docs/deployment_coolify.md` (as-built) and
`coolify_deployment_plan.md` (long-form reference). Pointer also in `AGENTS.md` → Other
conventions.

## Topology

- **Managed PostgreSQL** (`postgresql-<uuid>`), **denokv** cache as a **Docker Compose**
  resource (`denokv-<uuid>:4512`, `/data` volume), **API** + **web** as **Docker Image**
  resources pulling `ghcr.io/ardakilic/brewform-{api,web}:latest`.
- Images are built/pushed by GitHub Actions (`.github/workflows/release.yml`) on every `main`
  push; Coolify only pulls. The web image bakes `VITE_API_URL`/`VITE_PUBLIC_APP_URL` from repo
  Secrets at build.
- Domains: `brewform.cc` (web), `api.brewform.cc` (API), `cdn.brewform.cc` (Cloudflare R2
  custom domain for uploads). Email via Mailtrap.

## Gotchas (these cost real time — remember them)

- **denokv must be a Docker Compose resource**, NOT a Docker Image resource: Coolify v4.1.2
  Docker Image resources have no command field, so `denokv` exits (no `serve` arg). Compose
  supports `command:`.
- **Cross-resource networking:** managed DB + standalone Docker Image apps share the `coolify`
  network automatically; a **Compose** resource needs **"Connect to Predefined Network"**
  enabled to be reachable as `<service>-<uuid>`. Find the name with
  `docker ps --format '{{.Names}}' | grep denokv`.
- **`S3_ENDPOINT` = account endpoint only** (no bucket path). `apps/api/src/utils/storage/s3.ts`
  is path-style (`${endpoint}/${bucket}/${file}`); a bucket in the endpoint double-buckets → 403
  SignatureMismatch on uploads.
- **API needs no env for its own URL** — `PUBLIC_APP_URL`/`APP_URL` are the **frontend** URL;
  `CORS_ALLOWED_ORIGINS` lists frontend origins.
- **SMTP_SECURE=false** for Mailtrap on port 587 (STARTTLS); `true` only for 465.
- **Cloudflare proxy:** SSL/TLS mode must be **Full (Strict)** — `Flexible` causes an infinite
  redirect loop with Coolify's HTTPS redirect. Toggle the proxy at Cloudflare, not Coolify.
- **GHCR images are amd64-only:** ARM hosts get `exec format error`; ARM `docker pull` needs
  `--platform linux/amd64`.
- **Web image API URL is runtime-configurable** (PR #104): `VITE_API_URL` → `/config.js` via
  `docker-web-entrypoint.sh` (allowlist-validated); the SPA reads
  `globalThis.__BREWFORM_CONFIG__.apiUrl` first. `VITE_PUBLIC_APP_URL` is build-time only.
