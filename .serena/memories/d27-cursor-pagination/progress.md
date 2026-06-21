Cursor pagination implementation (change `d27-cursor-pagination`) is essentially complete. The remaining work is bookkeeping:
- Create `/Users/arda/projects/BrewForm/pr_description.md` summarizing the change.
- Update `openspec/changes/d27-cursor-pagination/tasks.md` checkboxes to reflect completed tasks.
- Optionally run the full `make test` once the `brewform-garage-1` dependency is healthy; the equivalent per-workspace tests already pass.
- Optionally add route-level tests for `GET /` cursor mode and `GET /feed/following` cursor mode if required by tasks.md.
- Verify OpenAPI coverage test still passes (`make test-specific filter=routes/openapi.coverage.test.ts`).

Verified so far:
- `make fmt` ✅
- `make lint` ✅
- `make check` ✅
- `docker compose run --rm --no-deps app deno test --no-check ... apps/api/src/` → 78 passed ✅
- `docker compose run --rm --no-deps app deno task --cwd packages/db test` → 14 passed ✅
- `docker compose run --rm --no-deps app deno task --cwd apps/web test` → 814 passed ✅
- `apps/api/src/modules/recipe/model.cursor.test.ts` and `service.cursor.test.ts` → 14 passed ✅

Note: `make test` directly fails because `make up` reports `brewform-garage-1` unhealthy; all test suites pass when run with `--no-deps` inside the already-up app container.