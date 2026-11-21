## Summary

<!-- What changes and why. Link the OpenSpec change (openspec/changes/<name>/) and any issue. -->

## Testing

<!-- Commands you ran and their results, e.g. `make check`, `make lint`, `make test-api`,
`make test-web`, `make test-shared`, `make docs-check`. List any manual checks. -->

## Docs & specs

- [ ] Runtime, infra, config or env change: AGENTS.md, README.md, the affected docs/*.md and openspec/specs updated (or N/A)
- [ ] New or changed route: OpenAPI metadata added and `docs/api-reference.md` regenerated (`pnpm --filter @brewform/api run docs:api`) (or N/A)
- [ ] New env var: `.env.example` files and deployment guide updated (or N/A)
- [ ] OpenSpec change validated with `openspec validate <change> --strict` (or N/A)
- [ ] `make docs-check` passes (doc-drift guard and docblock scan)
