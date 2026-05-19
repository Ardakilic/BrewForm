## Post-Edit Verification

After every code edit, run in order:

```bash
make check    # Type-check all workspaces (covers api, db, shared — web uses lint)
make lint     # Lint all apps and packages
```

Then run relevant tests:
```bash
make test              # All tests (via Docker)
make test-api          # If only API changed
make test-shared       # If only shared changed
make test-specific filter=path/to/test.ts  # Single test file
```

**IMPORTANT**: Type-check before tests. Tests use `--no-check` so type errors won't surface there.

## CI Pipeline (what CI runs)
```
deno task fmt-check && deno task lint && deno task check && deno task build && deno task test-coverage
```