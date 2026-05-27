## Dual-Volume Strategy (Critical)

Dev containers (`app`, `web-dev`) use bind mount + named volume to solve platform-specific native bindings:

| Mount | Source | Purpose |
|-------|--------|---------|
| `.:/app` | Bind mount (host) | Live editing + hot reload |
| `node_modules:/app/node_modules` | Named volume (container) | Shadows host node_modules — ensures Linux native binaries |
| `deno_cache:/root/.cache/deno` | Named volume | Persistent Deno cache across restarts |

Without the named node_modules volume, macOS bindings (e.g. `@rolldown/binding-darwin-arm64`) would shadow Linux bindings inside the container, causing `Cannot find module '@rolldown/binding-linux-arm64-gnu'`.

## Rebuilding After Dependency Changes

1. `make lockfile-update` — update lockfile
2. `make build` — rebuild image so new deps are baked into image's node_modules
3. `make down && make dev` — restart with fresh named volume

`make install` only caches inside existing container — does NOT rebuild the image.

## Service Profiles

| Profile | Starts |
|---------|--------|
| (none) | postgres, mailpit, pgadmin, garage |
| `--profile dev` | + app, web-dev |
| `--profile preview` | + app-preview, web (Caddy) |
| `--profile serena` | + serena MCP |

- `make up` — infra only (no profile)
- `make dev` — `--profile dev` (includes infra)
- `make serena-up` — `--profile serena` only

## Common Failures

| Error | Fix |
|-------|-----|
| `Cannot find module '@rolldown/binding-linux-*'` | `make down && make dev` (named volume stale); if persists: `make build && make down && make dev` |
| Stale deps after `deno install` | `docker compose down -v && make build && make dev` (clears named volume + rebuilds) |
| Port conflict | `make down && make dev` or kill the process on that port |

## .dockerignore

Must exclude `node_modules`, `.git`, `.turbo`, `coverage` — otherwise `COPY . .` overwrites image's Linux-arch dependencies with host's macOS ones.
