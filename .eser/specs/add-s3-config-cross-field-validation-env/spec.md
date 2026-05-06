# Spec: add-s3-config-cross-field-validation-env

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

env.ts uses .refine() checking only 3 of 5 S3 fields. S3StorageDriver constructor calls .replace() on S3_ENDPOINT and S3_PUBLIC_URL with non-null assertions. upload/index.ts calls createStorageDriver() at module-load time. Missing S3 vars cause TypeError on startup.

_-- Arda Kilicdagi_

### ambition

1-star: current .refine() with generic error. 10-star: .superRefine() with per-field errors, actual env.test.ts tests the real schema, lazy storage initialization.

_-- Arda Kilicdagi_

### reversibility

No, fully reversible single-file edit.

_-- Arda Kilicdagi_

### user_impact

Only affects deployments with STORAGE_DRIVER=s3 and incomplete S3_* env vars. Previously they got a cryptic TypeError; now they get clear per-field validation errors at startup.

_-- Arda Kilicdagi_

### verification

1) Run Deno type check on env.ts. 2) Start server with STORAGE_DRIVER=s3 and missing S3_ENDPOINT — verify clear error message. 3) Start server with STORAGE_DRIVER=s3 and all S3 vars set — verify clean startup. 4) Start server with STORAGE_DRIVER=local and no S3 vars — verify clean startup.

_-- Arda Kilicdagi_

### scope_boundary

Only env.ts schema. Do NOT modify upload/index.ts, storage/s3.ts, env.test.ts, or storage.test.ts. No new tests.

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

- Only env.ts schema
- Do NOT modify upload/index.ts, storage/s3.ts, env.test.ts, or storage.test.ts
- No new tests.

## Tasks

- [x] task-1: In apps/api/src/config/env.ts, replace existing .refine() with .superRefine() that checks all 5 S3 fields (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_PUBLIC_URL) when STORAGE_DRIVER === s3 and pushes individual ctx.addIssue() errors for each missing field. Files: apps/api/src/config/env.ts. AC-1: When STORAGE_DRIVER=s3 and any S3_* field is missing, safeParse fails with per-field errors. AC-2: When STORAGE_DRIVER=local, no S3_* fields are required. AC-3: When STORAGE_DRIVER=s3 and all 5 fields present, validation passes.
- [x] task-2: Run Deno type check on env.ts.
- [x] task-3: Manual verification: start server with STORAGE_DRIVER=s3 and missing S3_ENDPOINT — confirm clear error. Start with STORAGE_DRIVER=s3 and all vars — confirm clean startup. Start with STORAGE_DRIVER=local — confirm clean startup. Remove placeholder sections and tasks about tests/docs since scope says no new tests and no public-facing changes.

## Verification

- 1) Run Deno type check on env.ts. 2) Start server with STORAGE_DRIVER=s3 and missing S3_ENDPOINT — verify clear error message. 3) Start server with STORAGE_DRIVER=s3 and all S3 vars set — verify clean startup. 4) Start server with STORAGE_DRIVER=local and no S3 vars — verify clean startup.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-05T20:32:18.468Z | - |
