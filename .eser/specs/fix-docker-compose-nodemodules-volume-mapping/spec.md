# Spec: fix-docker-compose-nodemodules-volume-mapping

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

make install installs deps into anonymous Docker volumes. Host filesystem has no (or partial) node_modules. IDE shows missing imports. No workaround exists — this is the daily pain point.

_-- Arda Kilicdagi_

### ambition

1-star: Manual npm install on host to fix IDE. 10-star: make install writes to host filesystem automatically; IDE resolves all imports instantly; LSP works out of the box for every contributor.

_-- Arda Kilicdagi_

### reversibility

Fully reversible — only compose.yml changes. Revert = restore previous volume lines.

_-- Arda Kilicdagi_

### user_impact

No breaking changes. Only improves local dev UX. Makes onboarding easier (README says no local Node required).

_-- Arda Kilicdagi_

### verification

After change: make install -> verify ./node_modules, ./apps/**/node_modules, ./packages/**/node_modules appear on host. Open any TS file in IDE — imports should resolve.

_-- Arda Kilicdagi_

### scope_boundary

Does NOT touch Dockerfile, app code, or production runtime. Does NOT change how the app behaves inside the container. Does NOT introduce new env vars or services.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- Does NOT touch Dockerfile, app code, or production runtime
- Does NOT change how the app behaves inside the container
- Does NOT introduce new env vars or services.

## Tasks

- [x] task-1: Update compose.yml anonymous node_modules volumes to explicit bind mounts. Replace `- /app/node_modules` with `- ./node_modules:/app/node_modules`, `- /app/apps/api/node_modules` with `- ./apps/api/node_modules:/app/apps/api/node_modules`, `- /app/apps/web/node_modules` with `- ./apps/web/node_modules:/app/apps/web/node_modules`, `- /app/packages/shared/node_modules` with `- ./packages/shared/node_modules:/app/packages/shared/node_modules`, and `- /app/packages/db/node_modules` with `- ./packages/db/node_modules:/app/packages/db/node_modules`. Files: `compose.yml`
- [ ]
- [x] task-2: Verify `make install` populates host node_modules directories. Run `make install`, then confirm `./node_modules`, `./apps/api/node_modules`, `./apps/web/node_modules`, `./packages/shared/node_modules`, and `./packages/db/node_modules` exist on host with package contents.
- [ ]
- [x] task-3: Verify IDE import resolution. Open a TypeScript file in `apps/api/src/` or `apps/web/src/` and confirm LSP resolves imports from `node_modules` without errors.

## Verification

- After change: make install -> verify ./node_modules, ./apps/**/node_modules, ./packages/**/node_modules appear on host
- Open any TS file in IDE — imports should resolve.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-03T21:00:17.390Z | - |
