# Serena MCP — Semantic Code Retrieval

## What Is Serena?

[Serena](https://github.com/oraios/serena) is an open-source MCP (Model Context Protocol) server
that gives AI coding tools IDE-level understanding of a codebase. Rather than passing raw file
contents to the model, Serena exposes **semantic tools** — symbol lookup, reference finding, safe
renames, structured edits — backed by a real TypeScript language server (tsserver via
`typescript-language-server`).

Tools it provides (in `desktop-app` context):

| Tool | Purpose |
|------|---------|
| `get_symbols_overview` | High-level map of all symbols in a file or directory |
| `find_symbol` | Locate a symbol by name/path, optionally reading its body |
| `find_referencing_symbols` | Find all call sites / usages of a symbol |
| `replace_symbol_body` | Surgically replace a function/class body |
| `insert_after_symbol` / `insert_before_symbol` | Add code at a precise semantic position |
| `rename_symbol` | Safe rename across the codebase via the language server |
| `safe_delete_symbol` | Delete a symbol only if it has no references |
| Memory tools | Persistent per-project notes that survive conversation resets |

## Why BrewForm Uses Serena

BrewForm is a Deno 2 + TypeScript monorepo. Serena lets Claude Code and other AI clients navigate
the codebase semantically rather than relying on grep/glob alone — making refactors safer,
cross-file edits more accurate, and context retrieval cheaper (no need to dump entire files).

## Architecture

Serena runs as a **long-lived Docker service** alongside the rest of the stack.

```
Host machine                       Docker network (brewform-network)
────────────────────────────────   ─────────────────────────────────────────
Claude Code / OpenCode             brewform-serena (ghcr.io/oraios/serena)
  │                                  │  tsserver indexing /workspace/brewform
  │  SSE  http://localhost:10121/sse  │
  └──────────────────────────────────┘
  
  /Users/arda/projects/BrewForm  ←─── bind mount ──→  /workspace/brewform
```

### Volume mount

The entire monorepo is bind-mounted into the container as a **single workspace**:

```yaml
# compose.yml
volumes:
  - .:/workspace/brewform
```

This means Serena indexes `apps/api`, `apps/web`, and `packages` together. Cross-package symbol
resolution (e.g. finding usages of a shared type from `packages/` inside `apps/api/`) works
correctly because both sides are under the same workspace root.

### Startup command

```yaml
command: >
  serena start-mcp-server
    --transport sse
    --port 9121
    --host 0.0.0.0
    --context desktop-app
    --project /workspace/brewform
```

Key flag choices:

| Flag | Value | Reason |
|------|-------|--------|
| `--transport sse` | SSE | Required for remote/Docker connections; stdio only works for local subprocess |
| `--context desktop-app` | `desktop-app` | Broadest tool set, compatible with all MCP clients (Claude Code, OpenCode, VS Code extensions). Narrower contexts like `claude-code` remove tools other clients need. |
| `--project` | `/workspace/brewform` | Explicit container-internal path. **Cannot** use `--project-from-cwd` — the container's CWD is `/workspaces/serena` (Serena's own install dir), not the mounted project. Clients also send the host path (`/Users/arda/projects/BrewForm`) which doesn't exist inside the container. |

### Port mapping

Non-standard host ports are used to avoid collisions when multiple projects run their own Serena
instance simultaneously:

| Endpoint | Container port | Host port |
|----------|---------------|-----------|
| SSE (MCP clients connect here) | 9121 | **10121** |
| Web dashboard | 24282 | **34282** |

## What Is Ignored and Why

Serena respects `.gitignore` (`ignore_all_files_in_gitignore: true` in `.serena/project.yml`) and
the `ignored_paths` list:

```yaml
ignored_paths:
  - "node_modules"
  - "dist"
  - "build"
  - "coverage"
  - ".next"
  - "out"
  - "tmp"
  - "temp"
  - ".cache"
```

**Why these matter:** Without explicit exclusions, `node_modules` alone contains ~86 000 files.
Indexing them would make startup take minutes and pollute symbol search with third-party internals.
The `.gitignore` catches most of them, but the `ignored_paths` list is a belt-and-suspenders
fallback for cases where `.gitignore` rules aren't picked up correctly by the language server.

## Project Configuration — `.serena/project.yml`

```yaml
project_name: "brewform"
languages:
  - typescript   # uses typescript-language-server (tsserver)
encoding: "utf-8"
ignore_all_files_in_gitignore: true
```

This file is **committed to the repo** so every developer and AI client gets the same indexed view
of the codebase. The companion `.serena/project.local.yml` is for per-developer overrides and is
also committed (but currently empty — just the template comment).

Serena memories (`.serena/memories/`) are committed so AI-generated project notes persist across
sessions. The index cache (`.serena/cache/`) is git-ignored.

## Connecting AI Clients

All clients connect to the SSE endpoint: `http://localhost:10121/sse`

### Claude Code

Registered globally (one-time setup):

```bash
claude mcp add serena --transport sse --url http://localhost:10121/sse
```

Or via the per-project `.rulesync/mcp.json` (already configured, synced by rulesync).

### OpenCode

`opencode.jsonc` in the project root is pre-configured:

```jsonc
{
  "mcp": {
    "serena": {
      "type": "remote",
      "url": "http://localhost:10121/sse",
      "enabled": true
    }
  }
}
```

### VS Code / Cursor / Windsurf

`.vscode/mcp.json` in the project root:

```json
{
  "servers": {
    "serena": {
      "type": "sse",
      "url": "http://localhost:10121/sse"
    }
  }
}
```

## Makefile Commands

```bash
make serena-up      # Start the Serena container (detached)
make serena-stop    # Stop the Serena container
make serena-logs    # Tail Serena logs
make serena-index   # Force re-index /workspace/brewform
make serena-health  # Run a health check on the workspace
```

## Troubleshooting

### "Project not found" error in logs

```
Project '/Users/arda/projects/BrewForm' not found: Not a valid project name or directory.
```

**Cause:** The MCP client sent the host path, which doesn't exist inside the container.  
**Fix:** The `compose.yml` command must use `--project /workspace/brewform` (the container-internal
path), **not** `--project-from-cwd`. Verify the running command with:

```bash
docker inspect brewform-serena --format '{{.Config.Cmd}}'
```

### Serena is slow to start

The TypeScript language server needs to index the workspace on first start. This takes 5–15 seconds
depending on machine speed. Subsequent starts are faster because `npm install` for
`typescript-language-server` is cached in the container layer.

### Symbol search returns no results after pulling new code

Re-index the workspace:

```bash
make serena-index
```

### Dashboard unreachable

The dashboard is at `http://localhost:34282`. If unavailable, confirm the container is running:

```bash
docker compose ps serena
make serena-logs
```
