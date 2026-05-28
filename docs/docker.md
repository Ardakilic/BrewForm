# Docker Development Environment

BrewForm runs entirely inside Docker containers. No local Deno installation is required.

## Volume Strategy

The `compose.yml` uses a **dual-volume strategy** for dev containers (`app` and `web-dev`) to balance live source code editing with platform-specific native dependencies.

### Bind Mount (`.:/app`)

Mounts the entire project directory from the host into the container. This enables:

- **Hot reload** — file changes on the host are picked up immediately by `deno run --watch` and Vite HMR.
- **IDE integration** — breakpoints, git operations, and file searches work against the host filesystem.

### Named Volume (`node_modules:/app/node_modules`)

Overlays the container's own `node_modules` directory, **hiding** the host's `node_modules` from the container's view. This is critical because:

- **Native bindings are platform-specific.** When you run `deno install` on macOS, it downloads `@rolldown/binding-darwin-arm64`. The Docker container (Linux) needs `@rolldown/binding-linux-arm64-gnu`.
- Without the named volume, the host's macOS bindings would shadow the container's Linux bindings, causing runtime errors like:

```text
Error: Cannot find module '@rolldown/binding-linux-arm64-gnu'
```

### Deno Cache Volume (`deno_cache:/root/.cache/deno`)

A persistent named volume for the global Deno cache (`/root/.cache/deno`). This avoids re-downloading JSR and npm packages on every container restart.

### Volume Resolution Order

Inside the container, the filesystem looks like this:

```text
/app
├── apps/              ← from bind mount (host)
├── packages/          ← from bind mount (host)
├── deno.json          ← from bind mount (host)
├── node_modules/      ← from named volume (container image)
└── ...
```

The named `node_modules` volume takes precedence over the bind mount for that single directory, while everything else is live from the host.

## Rebuilding After Dependency Changes

If you add or update dependencies in `deno.json` or any `package.json`:

1. Update the lockfile:
   ```bash
   make lockfile-update
   ```
2. Rebuild the Docker image so the new dependencies are baked into the image's `node_modules`:
   ```bash
   make build
   ```
3. Restart the dev containers so the fresh `node_modules` volume is mounted:
   ```bash
   make down && make dev
   ```

> **Note:** `make install` only caches dependencies inside the existing container. It does **not** rebuild the image. After structural dependency changes, always run `make build` followed by `make down && make dev`.

## Services Overview

| Service      | Profile | Purpose                                          | Port  |
|--------------|---------|--------------------------------------------------|-------|
| `app`        | `dev`   | Hono API with hot reload (`deno run --watch`)    | 8000  |
| `web-dev`    | `dev`   | Vite dev server with HMR                         | 5173  |
| `app-preview`| `preview` | Production-like API (built image, no reload)     | 8000  |
| `web`        | `preview` | Caddy static file server (built SPA)             | 8080  |
| `postgres`   | —       | PostgreSQL database                                | 5432  |
| `mailpit`    | —       | SMTP capture + web UI                              | 1025  |
| `garage`     | —       | S3-compatible object storage                       | 3900  |
| `pgadmin`    | —       | PostgreSQL admin UI                                | 5050  |
| `serena`     | `serena`| Semantic code retrieval MCP server                 | 10122 |

Profiles are used to prevent accidental service startup:

- `make up` — starts only infrastructure (`postgres`, `mailpit`, `pgadmin`, `garage`)
- `make dev` — starts infrastructure + `app` + `web-dev`
- `make preview` — starts infrastructure + `app-preview` + `web`
- `make serena-up` — starts `serena` only

## Dockerfile Runner Stage — Workspace Manifest Requirement

The production `runner` stage in `Dockerfile` copies **all** workspace member manifests (`package.json` + `deno.json`), even for members that are not served at runtime (e.g., `apps/web`).

### Why?

The root `deno.json` defines workspace members with globs:

```json
"workspace": {
  "members": ["apps/*", "packages/*"]
}
```

When `deno ci --prod` runs in the runner stage, Deno resolves the full workspace graph. The `deno.lock` contains entries for **all** discovered members. If a member's manifest is missing on disk, the workspace resolver errors:

```text
error: The lockfile is out of date. Run `deno install --frozen=false`...
```

### What is copied

Only **manifests** (no source code):

```dockerfile
COPY apps/web/package.json apps/web/deno.json ./apps/web/
```

Application source is copied selectively:

```dockerfile
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/packages ./packages
```

This keeps the production image minimal while satisfying Deno's workspace resolution.

## Troubleshooting

### "Cannot find module '@rolldown/binding-linux-arm64-gnu'"

**Cause:** The host's `node_modules` (with macOS bindings) is shadowing the container's `node_modules`.

**Fix:** Ensure the `node_modules` named volume is defined in `compose.yml` and recreate the containers:

```bash
make down && make dev
```

If the error persists, rebuild the image to pull the correct Linux bindings:

```bash
make build && make down && make dev
```

### Stale Dependencies After `deno install`

**Cause:** The `node_modules` named volume is pinned to an older image layer.

**Fix:** Clear the volume and rebuild:

```bash
docker compose down -v
make build
make dev
```

### Port Already Allocated

**Cause:** `make up` was run without stopping, or another process is bound to the port.

**Fix:** Stop all services and start fresh:

```bash
make down
make dev
```
