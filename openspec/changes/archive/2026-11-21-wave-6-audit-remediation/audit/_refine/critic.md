# Implementation-readiness critic pass (2026-11-19)

Scope: every user decision (U1-U4, D1-D5, OQ1-OQ4) and both Non-Goals traced to a requirement, a
scenario and a task; a contradiction sweep across `proposal.md`, `design.md`, `tasks.md` and
`specs/**`; the executability of `tasks.md`; strict validation; and a sandbox archive. The fixes
below are already applied in this change folder (this pass may edit any file in it).

## 1. Findings

### Decision coverage

| Id | Requirement and scenario | Tasks | Status |
|---|---|---|---|
| U1 | `web-shared-components` "Every route renders under the app-wide providers" | 12.1-12.7, 12.20 | covered |
| U2 | `advanced-search` "Database-side relevance ranking", "Bounded per-request memory…", "Trigram indexes…", "Database query time budget…", "Search term bounds…" | 10.1-10.36 | covered |
| U3 | `web-data-loading` (12 requirements, including the two enforcement tests) | 12.11-12.19, 14.1-14.15, 15.1-15.21, 16.1-16.8, 17.3-17.4, 17.18-17.19 | covered |
| U4 | `ci-image-publishing` "Images are published only after CI succeeds", "Pull requests build and smoke-test both images…" | 22.3-22.6, 28.6, 29.8, 29.14 | covered (29.8 added) |
| D1 IDOR | `recipe-personal-notes` "The legacy notes POST endpoint is removed", "Author brewer notes are writable only through the recipe write flow" | 4.1-4.3, 4.16-4.17, 4.19 | covered |
| D1 private notes | `recipe-personal-notes` storage, read, write, delete, leak, UI, labels, account deletion, docs | 4.4-4.15, 4.18, 4.20, 17.1-17.7, 17.14 | covered |
| D2a | `recipe-write` "An update never resets omitted visibility or favourite state" | 8.1, 8.4, 8.12, 8.18 | covered |
| D2b | `photo-upload-security` "No client-supplied filename can alter a signed S3 request", "Uploads never overwrite an existing object", "Operators are guided to audit buckets…" | 5.2, 5.13-5.19, 5.22, 5.24, 5.26-5.27, 5.35, 22.10 | covered |
| D3 | `recipe-slug`, `unique-identifiers`, `error-handling`, `recipe-write` "Recipe payloads reject duplicate relation ids" | 7.1-7.30, 8.2 | covered |
| D4 | `recipe-collections` "Collection items show only recipes the viewer may list", counts, add rule, cache re-check, reorder | 9.4-9.14, 9.19 | covered |
| D5 | `production-operations` "Persistent data locations are selected by one variable each"; `deployment-guide` "Coolify guide documents persistent local upload storage"; `api-env-config` | 3.5-3.7, 21.8-21.20, 22.2, 22.9, 22.11-22.12 | covered (22.12 wording fixed) |
| OQ1 | `recipe-visibility` (8 requirements), `advanced-search` visibility clause, `recipe-filter`, `equipment-recipe-query`, `brew-journal` | 9.1-9.3, 11.1-11.12, 15.6, 15.11-15.15 | covered (proposal wording fixed) |
| OQ2 | `recipe-slug` "Slug suffixes are short, random, unambiguous…" | 7.1-7.2, 7.8-7.10 | covered |
| OQ3 | `recipe-personal-notes` "The legacy notes POST endpoint is removed" | 4.1-4.3, 4.16, 4.18-4.19, 17.2, 17.21 | covered |
| OQ4 | `production-operations` "API exposes separate liveness and readiness probes", "Production services declare health checks…"; `container-deployment` image `HEALTHCHECK`s; `deployment-guide` "Coolify guide gives exact health-check settings"; `node-runtime` shutdown | 20.6-20.12, 21.1-21.3, 21.10-21.12, 22.3-22.4, 22.11 | covered |
| Non-Goal: demo seed | `proposal.md` Non-Goals; no task changes the seed's accounts (7.23 only normalises `ADMIN_EMAIL`) | 26.3 | covered (26.3 wording fixed: the seed creates demo accounts on a production first boot, `packages/db/src/seed.ts:201-237`, `docker-entrypoint.sh:21-25`) |
| Non-Goal: admin parallel CRUD | `proposal.md` Non-Goals; admin changes limited to the unique-violation helper and identifier lookups | 2.9, 7.18-7.19 | covered |

### Contradictions and gaps found

- `proposal.md:42` said unlisted recipes never appear in "other users' collections, … for any
  viewer including the author". The specs (`recipe-collections:5`, `recipe-visibility` class table)
  show them inside any collection to the recipe's own author. Fixed.
- `tasks.md` 22.12 described the host-folder rule as "`/` or `./`"; `production-operations:46-54`
  says `/`, `.` or `~`. Fixed.
- `tasks.md` 25.12 said "Both images' `HEALTHCHECK`s … run `node /app/healthcheck.mjs /ready`"; the
  web image runs `wget … /healthz` (`container-deployment:176`, task 21.3). Fixed.
- `tasks.md` 26.3 called the demo accounts "development only"; the seed has no environment gate. Fixed.
- `tasks.md` 28.4 expected 44 Purpose placeholders; the sandbox archive leaves 46 (29 today, minus 3
  in the retired folders, plus 20 new capabilities). Fixed.
- `tasks.md` 2.3 credited the `57014` service-side catch to task 10.27; it is task 10.17. Fixed.
- `tasks.md` 6.20 left the test file as a choice. Fixed to `apps/api/src/main.rateLimit.test.ts`.
- `recipe-visibility` Rule B listed unit kinds without `async function`; `brew-log/model.ts:49` is a
  non-exported `async function list`, which the scan would have merged into the previous unit.
  Fixed in the spec and in task 11.10.
- `design.md` Migration Plan said "Optionally set `PUBLIC_APP_URL`" and the rollback list said
  "if desired"; `production-operations` upgrade notes said "Optionally set `UPLOADS_SOURCE`". All
  three rewritten as direct instructions.
- Groups 1, 4, 13, 14, 20, 21, 23, 25, 26 and 27 had no closing check step; group 29 never built
  or boot-tested the images. Fixed (section 3).
- The author's own profile not listing their unlisted recipes was applied but not flagged to the
  user. Added as a fourth interpretation call in `design.md` → Open Questions.

### Verified as consistent (no change)

- Health: `/health` liveness and `/ready` readiness keys (`status, db, cache, rateLimitStore,
  storage, shuttingDown`) agree across `production-operations:144-210`, tasks 20.6/20.8/22.3; image
  check 15s/5s/180s/2s/3 (`container-deployment:341`, task 20.12) and Coolify 15/5/3/180
  (`deployment-guide:74-115`, task 22.11); compose api `start_period: 60s` because the `migrate`
  service runs migrations before the api starts.
- Storage: named volumes `uploads`, `postgres_data`, `backups` by default and the `*_SOURCE`
  switch agree across `production-operations`, `deployment-guide`, tasks 21.9, 21.13-21.16, 22.9.
- No `deprecated`, `alias` or `saveNotes` text keeps the notes `POST` alive; every hit describes its
  removal.
- Every `task N.M` and `group N` reference resolves (script check over all 52 spec files, design,
  proposal and tasks); numbering is contiguous in every group.
- `proposal.md` capabilities match the 52 folders one-to-one (structure checker: NO ISSUES).

## 2. Design text

Added to `design.md` → Cross-track integration as decision 7 "Implementation-readiness pass", and
to Open Questions → interpretation calls:

- Decision: authors do not see their own unlisted, draft or private recipes in discovery listings,
  their profile included.
  - Choice: discovery queries stay viewer-independent (`listableRecipeCondition(null)`).
  - Alternatives: pass the viewer on the owner's profile.
  - Rationale: the literal reading of "only with the absolute link can find it"; cache-safe
    responses; no regression. Reversal path recorded in `design.md`.

## 3. Tasks to add (applied)

- [ ] 1.7 Group check: `openspec validate wave-6-audit-remediation --strict`, `openspec list`, `git status openspec/specs`.
- [ ] 4.22 Group check: `make check`, `make lint`, `make test-shared`, `make test-specific filter=src/schema-`, `make db-generate`, `make fmt`, `make fmt-check`.
- [ ] 13.8 Group check: `make check-web`, `make lint`, `make test-web`, `make fmt`, `make fmt-check`.
- [ ] 14.15 Group check: web check, lint, tests (pending lists shrunk), i18n parity, format.
- [ ] 20.15 Group check: check, lint, shared/api tests, migrate and preflight tests, db-generate freshness, `sh -n docker-entrypoint.sh`, format.
- [ ] 21.20 Group check: `sh -n`, compose config checks, web entrypoint test, lint, format.
- [ ] 23.20 Group check: check, check-tests, lint at error level, every test suite, format.
- [ ] 25.13, 26.21, 27.10 Group checks: doc-drift findings confined to `openspec/specs/` until group 28.
- [ ] 29.8 Build and boot-test both images (`make images`, `compose-config-check.sh`, `smoke-images.sh`, `make prod-smoke`, `check-publish-needs.sh`); former 29.8-29.13 became 29.9-29.14.

## 4. Tasks modified (applied)

2.3, 6.20, 11.10, 11.11, 17.4 (failing component tests first), 22.12, 25.12, 26.3, 28.4, 29.13
(all interpretation calls in the PR description).

## 5. Cross-folder requests

None. This pass owns the whole change folder.

## 6. Remaining open questions

None block implementation. The four interpretation calls in `design.md` → Open Questions are
binding defaults that the user can reverse:
- viewer-only records (Starred, brew journal) may show unlisted recipes the viewer saved;
- the Coolify API health check is the `CMD` type;
- every image and compose health check probes `/ready`;
- authors do not see their own hidden recipes in discovery listings, their profile included.
