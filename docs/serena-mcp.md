# Serena MCP Integration

BrewForm integrates [Serena](https://github.com/oraios/serena) — a semantic code retrieval MCP server — to provide AI coding tools with deep understanding of the Deno/TypeScript monorepo codebase.

## What Is Serena

Serena gives AI coding tools (Claude Code, OpenCode, VS Code extensions, Cursor, Windsurf) IDE-level understanding of your codebase through:

- **Symbol indexing** — Functions, types, interfaces, classes, and variables indexed across all workspaces
- **Semantic search** — Find code by meaning, not just text matching
- **Structured editing** — Make precise, context-aware changes across the codebase
- **Cross-package resolution** — Navigate symbols across Deno workspace boundaries

Serena uses the **TypeScript Language Server** (`ts_ls`) as its backend, providing full type-aware code intelligence for Deno projects.

## Why BrewForm Uses Serena

BrewForm is a Deno monorepo with 4 workspace members:

| Workspace | Purpose | Language |
|-----------|---------|----------|
| `apps/api` | Hono REST API | TypeScript |
| `apps/web` | React SPA (Vite) | TypeScript/TSX |
| `packages/shared` | Shared utilities and types | TypeScript |
| `packages/db` | Drizzle ORM schema and migrations | TypeScript |

Without Serena, AI tools read files blindly — no understanding of cross-workspace symbol dependencies, type hierarchies, or import graphs. Serena's `additional_workspace_folders` configuration enables cross-package symbol resolution, so AI tools can:

- Find all usages of a shared type from `packages/shared` across `apps/api` and `apps/web`
- Navigate import chains through the Deno workspace dependency graph
- Understand Drizzle schema references from `packages/db` in API route handlers

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   AI Client     │────▶│   Serena Container  │────▶│  TypeScript  │
│  (Claude Code,  │     │   (Docker)          │     │  Language    │
│   OpenCode,     │◀────│   SSE :9121         │◀────│  Server      │
│   VS Code)      │     │   Dashboard :24282  │     │  (ts_ls)     │
└─────────────────┘     └─────────────────────┘     └─────────────┘
        │                        │
   localhost:10122          localhost:24282
   (SSE endpoint)           (Web dashboard)
```

- **Host**: AI client connects to `localhost:10122/sse`
- **Container**: Serena MCP server runs in Docker (port 9121 internal)
- **ts_ls**: TypeScript Language Server indexes the mounted workspace

## Volume Mount

The entire project root is bind-mounted as a single volume (not a Docker volume):

```yaml
volumes:
  - .:/workspace/brewform
```

This means Serena sees the complete monorepo at `/workspace/brewform` including all 4 workspace members, `deno.json` (workspace config), and `deno.lock`. The workspace members are declared as `additional_workspace_folders` in `.serena/project.yml` for cross-package symbol discovery.

## Startup Command

```bash
serena start-mcp-server \
  --transport sse \
  --port 9121 \
  --host 0.0.0.0 \
  --context desktop-app \
  --project /workspace/brewform
```

### Flag Rationale

| Flag | Value | Reason |
|------|-------|--------|
| `--transport sse` | SSE | Required for remote/Docker connections; `stdio` only works for local subprocess |
| `--port 9121` | 9121 | Container-internal port; mapped to host 10122 in compose.yml |
| `--host 0.0.0.0` | `0.0.0.0` | Accept connections from outside the container |
| `--context desktop-app` | `desktop-app` | Broadest tool set, compatible with all MCP clients. Narrower contexts like `claude-code` remove tools other clients need |
| `--project /workspace/brewform` | Explicit container path | Cannot use `--project-from-cwd` — the container's CWD is `/workspaces/serena`, not the mounted project |

## Port Mapping

| Endpoint | Container Port | Host Port | Purpose |
|----------|-----------------|-----------|----------|
| SSE | 9121 | 10122 | MCP client connections |
| Dashboard | 24282 | 24282 | Serena web UI for inspection |

Non-standard host ports are used to avoid conflicts with other projects and the existing BrewForm services (8000, 5173, 5432, 1025, 8025, 5050, 3900, 3902, 8080).

Access the dashboard at http://localhost:24282

## Monorepo Indexing Strategy

BrewForm uses Serena's `additional_workspace_folders` feature for monorepo support:

```yaml
# .serena/project.yml
additional_workspace_folders:
  - apps/api
  - apps/web
  - packages/shared
  - packages/db
```

These are relative to the project root (`/workspace/brewform`). Serena's TypeScript language server discovers symbols across all workspace folders, enabling cross-package references and type-aware navigation.

## What Is Ignored and Why

### `.gitignore` + `ignored_paths`

The following are excluded from indexing:

| Path | Reason |
|------|--------|
| `dist` | Build outputs — already .gitignored |
| `build` | Alternative build directory |
| `.cache` | Generic cache directory |
| `node_modules` | Third-party dependencies — would pollute symbol search |
| `coverage` | Test coverage reports — not source code |
| `.eser` | noskills configuration — internal tooling |

Root `.gitignore` also excludes `.serena/cache/` and `.serena/project.local.yml`.

## Project Configuration

`.serena/project.yml` contains the Serena configuration. Key settings:

- **`languages: ["typescript"]`** — Uses `ts_ls` (TypeScript Language Server)
- **`ignore_all_files_in_gitignore: true`** — Respects `.gitignore` for exclusions
- **`ignored_paths`** — Additional paths specific to Deno/Node builds
- **`additional_workspace_folders`** — All 4 Deno workspace members for cross-package symbol discovery

## TypeScript/Deno Language Server Notes

Serena uses `ts_ls` (TypeScript Language Server) for indexing. By default, it detects `tsconfig.json` and `deno.json` configuration automatically. No custom `ls_specific_settings` are needed — the workspace-level `deno.json` at the project root provides all necessary compiler options and module resolution settings.

If needed, you can add `ls_specific_settings` in `.serena/project.yml` for advanced TypeScript options, but this is not required for standard Deno projects.

## Connecting AI Clients

### OpenCode

`opencode.jsonc` is pre-configured in the project root if using OpenCode:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "serena": {
      "type": "remote",
      "url": "http://localhost:10122/sse",
      "enabled": true
    }
  }
}
```

### Claude Code

```bash
claude mcp add serena --transport sse --url http://localhost:10122/sse
```

### VS Code / Cursor / Windsurf

The project root includes `.mcp.json` which is recognized by these editors:

```json
{
  "mcpServers": {
    "serena": {
      "type": "sse",
      "url": "http://localhost:10122/sse"
    }
  }
}
```

Alternatively, create `.vscode/mcp.json` with the same content.

### Any MCP-Compatible Client

Connect to the SSE endpoint at `http://localhost:10122/sse`.

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make serena-up` | Start Serena MCP service (uses `--profile serena`) |
| `make serena-down` | Down Serena MCP service (removes container) |
| `make serena-logs` | View Serena container logs |
| `make serena-index` | Re-index the project workspace |
| `make serena-health` | Health check — verifies SSE endpoint responds |

Serena uses the `serena` Docker Compose profile, so it never starts automatically with `make up` or `make dev`. Start it explicitly when you need AI-powered code understanding.

### Re-indexing After Structural Changes

After adding new packages, renaming modules, or making other structural changes, re-index the project:

```bash
make serena-index
```

This runs `serena project index /workspace/brewform` inside the container, refreshing all symbol databases.

## Serena Memories (.serena/)

The `.serena/` directory stores Serena's project memories:

```
.serena/
├── .gitignore          # Ignores cache/ and project.local.yml
├── project.yml         # Project configuration (tracked in git)
├── cache/              # Index cache (gitignored — regenerated on first run)
└── project.local.yml   # Local overrides (gitignored — developer-specific)
```

- **Tracked in git**: `project.yml`, `.gitignore` — shared across the team
- **Gitignored**: `cache/`, `project.local.yml` — regenerated or developer-specific
- **No Docker volumes** — memories persist as regular files in the repository

## Troubleshooting

### Project Not Found

If clients report "project not found", ensure the container is running and the project path matches:

```bash
make serena-up
docker compose --profile serena exec serena serena project index /workspace/brewform
```

### Slow Start

The TypeScript language server takes time to index the monorepo on first run. Check logs:

```bash
make serena-logs
```

Wait for indexing completion messages for all workspace folders.

### Stale Index

If search results seem wrong after code changes, re-index:

```bash
make serena-index
```

### Dashboard Unreachable

Ensure the dashboard port (24282) is not in use by another application:

```bash
lsof -i :24282
```

### Port Conflicts

If ports 10122 or 24282 are in use, modify the host port mappings in `compose.yml`. **Important**: The dashboard host port MUST match the internal port (24282) due to Serena's host-header security check.

```yaml
ports:
  - "<your-port>:9121"    # SSE
  - "<your-port>:24282"   # Dashboard
```

Then update `.mcp.json` and any client configurations to use the new SSE port.

### Container Won't Start

Check for conflicting container names:

```bash
docker ps -a | grep brewform-serena
docker rm brewform-serena  # Remove old container if needed
make serena-up
```

## Reference

- Serena GitHub: https://github.com/oraios/serena
- Serena Docker documentation: https://github.com/oraios/serena/blob/main/DOCKER.md
- Serena configuration reference: https://github.com/oraios/serena/blob/main/docs/02-usage/050_configuration.md
- BrewForm implementation plan: [`plan_serena.md`](../plan_serena.md)