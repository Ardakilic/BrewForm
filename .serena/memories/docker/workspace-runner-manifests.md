## Workspace Manifest Requirement in Dockerfile Runner Stage

**Invariant:** The production `runner` stage must copy ALL workspace member manifests (`package.json` + `deno.json`), even for members not served at runtime.

**Why:** Root `deno.json` workspace globs (`"members": ["apps/*", "packages/*"]`) cause `deno ci --prod` to resolve the full workspace graph. The lockfile contains entries for all members. Missing manifests cause:
```text
error: The lockfile is out of date...
```

**What is copied:** Only manifests, not source code.
```dockerfile
COPY apps/web/package.json apps/web/deno.json ./apps/web/
```

**What is NOT copied:** Source code for unused members.
```dockerfile
# Only API source + shared packages
COPY --from=builder /app/apps/api/src ./apps/api/src
COPY --from=builder /app/packages ./packages
```

**Applies to:** Any Dockerfile stage running `deno ci` or `deno install` in a workspace project.

**Related:** `mem:docker` (general Docker conventions), `docs/docker.md`.
